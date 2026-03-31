"""Kubernetes deployment status checks for dev environment."""
import json
import subprocess
from typing import Any, Dict, List, Optional


def check_kubectl_available() -> bool:
    """Check if kubectl is installed and accessible."""
    try:
        result = subprocess.run(
            ["kubectl", "version", "--client"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def get_dev_deployments() -> Dict[str, Any]:
    """
    Get deployment status for all services in dev namespace.

    Returns dict with:
      - kubectl_available: bool
      - namespace: str
      - message: str (if kubectl not available)
      - deployments: [ { name, ready, replicas, image, restarts, ... } ]
      - timestamp: ISO string
    """
    if not check_kubectl_available():
        return {
            "kubectl_available": False,
            "namespace": "dev",
            "message": (
                "kubectl not installed or not accessible. "
                "Install kubectl to see deployment status. "
                "https://kubernetes.io/docs/tasks/tools/"
            ),
            "deployments": [],
        }

    try:
        # Get all deployments in dev namespace
        deployments_result = subprocess.run(
            ["kubectl", "get", "deployments", "-n", "dev", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if deployments_result.returncode != 0:
            return {
                "kubectl_available": True,
                "namespace": "dev",
                "message": f"Failed to fetch deployments: {deployments_result.stderr}",
                "deployments": [],
            }

        deployments_data = json.loads(deployments_result.stdout)
        deployment_names = [d["metadata"]["name"] for d in deployments_data.get("items", [])]

        # Get pod info for all pods in dev namespace
        pods_result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "dev", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if pods_result.returncode != 0:
            return {
                "kubectl_available": True,
                "namespace": "dev",
                "message": f"Failed to fetch pods: {pods_result.stderr}",
                "deployments": [],
            }

        pods_data = json.loads(pods_result.stdout)
        pods_by_owner = _group_pods_by_owner(pods_data.get("items", []))

        # Build deployment status list
        deployments_status = []
        for dep in deployments_data.get("items", []):
            dep_name = dep["metadata"]["name"]
            spec = dep["spec"]
            status = dep["status"]

            # Get pods for this deployment
            dep_pods = pods_by_owner.get(dep_name, [])
            total_restarts = sum(
                sum(c.get("restartCount", 0) for c in pod.get("status", {}).get("containerStatuses", []))
                for pod in dep_pods
            )

            deployments_status.append({
                "name": dep_name,
                "desired_replicas": spec["replicas"],
                "ready_replicas": status.get("readyReplicas", 0),
                "available_replicas": status.get("availableReplicas", 0),
                "updated_replicas": status.get("updatedReplicas", 0),
                "total_restarts": total_restarts,
                "pod_count": len(dep_pods),
                "image": _extract_image(dep),
                "pod_status": [
                    {
                        "name": pod["metadata"]["name"],
                        "ready": _is_pod_ready(pod),
                        "restarts": _get_pod_restarts(pod),
                        "age": pod["metadata"].get("creationTimestamp"),
                    }
                    for pod in dep_pods
                ],
            })

        return {
            "kubectl_available": True,
            "namespace": "dev",
            "message": f"Showing {len(deployments_status)} deployments in dev namespace",
            "deployments": sorted(deployments_status, key=lambda x: x["name"]),
        }

    except json.JSONDecodeError as e:
        return {
            "kubectl_available": True,
            "namespace": "dev",
            "message": f"Failed to parse kubectl output: {str(e)}",
            "deployments": [],
        }
    except subprocess.TimeoutExpired:
        return {
            "kubectl_available": True,
            "namespace": "dev",
            "message": "kubectl commands timed out (>30s). Try again.",
            "deployments": [],
        }
    except Exception as e:
        return {
            "kubectl_available": True,
            "namespace": "dev",
            "message": f"Unexpected error: {str(e)}",
            "deployments": [],
        }


def _group_pods_by_owner(pods: List[Dict]) -> Dict[str, List[Dict]]:
    """Group pods by their deployment owner."""
    by_owner = {}
    for pod in pods:
        owner_refs = pod["metadata"].get("ownerReferences", [])
        for owner in owner_refs:
            if owner.get("kind") == "ReplicaSet":
                # Pod is owned by a ReplicaSet, which is owned by a Deployment
                rs_name = owner["name"]
                # ReplicaSet name format: {deployment-name}-{hash}
                # Extract deployment name by removing the hash
                dep_name = "-".join(rs_name.split("-")[:-1])
                if dep_name not in by_owner:
                    by_owner[dep_name] = []
                by_owner[dep_name].append(pod)
    return by_owner


def _extract_image(deployment: Dict) -> str:
    """Extract container image from deployment spec."""
    containers = deployment["spec"]["template"]["spec"].get("containers", [])
    if containers:
        return containers[0].get("image", "unknown")
    return "unknown"


def _is_pod_ready(pod: Dict) -> bool:
    """Check if all containers in pod are ready."""
    conditions = pod["status"].get("conditions", [])
    for condition in conditions:
        if condition["type"] == "Ready":
            return condition["status"] == "True"
    return False


def _get_pod_restarts(pod: Dict) -> int:
    """Get total restart count for all containers in pod."""
    total = 0
    for container in pod["status"].get("containerStatuses", []):
        total += container.get("restartCount", 0)
    return total
