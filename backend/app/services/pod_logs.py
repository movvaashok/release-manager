"""Service for retrieving pod logs from Kubernetes."""

import asyncio
import json
import subprocess
from datetime import datetime
from typing import Optional


def check_kubectl_available() -> bool:
    """Check if kubectl is available."""
    try:
        subprocess.run(['kubectl', 'version', '--client'], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


async def get_service_logs(namespace: str, deployment_name: str) -> dict:
    """
    Get logs from all pods of a specific deployment.

    Returns:
        {
            "success": bool,
            "message": str,
            "kubectl_available": bool,
            "logs": {
                "pod_name": {
                    "logs": "log content",
                    "timestamp": "ISO 8601 timestamp"
                },
                ...
            },
            "error": str (if failed)
        }
    """
    if not check_kubectl_available():
        return {
            "success": False,
            "message": "kubectl not installed",
            "kubectl_available": False,
            "error": "kubectl is not installed. Please install kubectl to retrieve pod logs."
        }

    try:
        # Get all pods for the deployment using label selector
        # Kubernetes sets app=<deployment-name> label by default
        pods_cmd = [
            'kubectl', 'get', 'pods',
            '-n', namespace,
            '-l', f'app={deployment_name}',
            '-o', 'json'
        ]

        result = subprocess.run(pods_cmd, capture_output=True, text=True, check=True)
        pods_data = json.loads(result.stdout)
        pods = pods_data.get('items', [])

        if not pods:
            return {
                "success": True,
                "message": f"No pods found for deployment '{deployment_name}' in namespace '{namespace}'",
                "kubectl_available": True,
                "logs": {}
            }

        # Collect logs from each pod
        logs_data = {}
        timestamp = datetime.utcnow().isoformat() + 'Z'

        for pod in pods:
            pod_name = pod.get('metadata', {}).get('name')
            if not pod_name:
                continue

            try:
                # Get logs from the pod
                logs_cmd = [
                    'kubectl', 'logs',
                    '-n', namespace,
                    pod_name,
                    '--timestamps=true',  # Include timestamps in logs
                    '--tail=500'  # Last 500 lines
                ]

                logs_result = subprocess.run(logs_cmd, capture_output=True, text=True, timeout=10)

                if logs_result.returncode == 0:
                    logs_data[pod_name] = {
                        "logs": logs_result.stdout,
                        "timestamp": timestamp,
                        "status": "success"
                    }
                else:
                    logs_data[pod_name] = {
                        "logs": f"Error retrieving logs: {logs_result.stderr}",
                        "timestamp": timestamp,
                        "status": "error"
                    }
            except subprocess.TimeoutExpired:
                logs_data[pod_name] = {
                    "logs": "Timeout retrieving logs (exceeded 10 seconds)",
                    "timestamp": timestamp,
                    "status": "timeout"
                }
            except Exception as e:
                logs_data[pod_name] = {
                    "logs": f"Error: {str(e)}",
                    "timestamp": timestamp,
                    "status": "error"
                }

        return {
            "success": True,
            "message": f"Retrieved logs from {len(logs_data)} pod(s)",
            "kubectl_available": True,
            "logs": logs_data
        }

    except subprocess.CalledProcessError as e:
        return {
            "success": False,
            "message": "Failed to retrieve pod logs",
            "kubectl_available": True,
            "error": f"kubectl error: {e.stderr}"
        }
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "message": "Failed to parse kubectl output",
            "kubectl_available": True,
            "error": f"JSON parse error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": "Failed to retrieve pod logs",
            "kubectl_available": True,
            "error": str(e)
        }
