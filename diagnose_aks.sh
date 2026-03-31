#!/bin/bash
# AKS deployment diagnostics for release tool
# Run: bash diagnose_aks.sh | tee diagnose_output.txt

NAMESPACE="dev"

echo "========================================"
echo "1. ALL DEPLOYMENTS IN NAMESPACE: $NAMESPACE"
echo "========================================"
kubectl get deployments -n $NAMESPACE

echo ""
echo "========================================"
echo "2. DEPLOYMENT NAME → IMAGE TAG MAPPING"
echo "========================================"
kubectl get deployments -n $NAMESPACE \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'

echo ""
echo "========================================"
echo "3. DEPLOYMENT LABELS"
echo "========================================"
kubectl get deployments -n $NAMESPACE \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.metadata.labels}{"\n"}{end}'

echo ""
echo "========================================"
echo "4. POD LABELS (first pod per deployment)"
echo "========================================"
kubectl get pods -n $NAMESPACE \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.metadata.labels}{"\n"}{end}' | head -40

echo ""
echo "========================================"
echo "5. ROLLOUT STATUS — ALL DEPLOYMENTS"
echo "========================================"
for dep in $(kubectl get deployments -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}'); do
  echo -n "$dep: "
  kubectl rollout status deployment/$dep -n $NAMESPACE --timeout=5s 2>&1 | tail -1
done

echo ""
echo "========================================"
echo "6. POD STATUS SUMMARY"
echo "========================================"
kubectl get pods -n $NAMESPACE -o wide

echo ""
echo "========================================"
echo "7. SAMPLE — DESCRIBE FIRST DEPLOYMENT"
echo "========================================"
FIRST_DEP=$(kubectl get deployments -n $NAMESPACE -o jsonpath='{.items[0].metadata.name}')
echo "Deployment: $FIRST_DEP"
kubectl describe deployment/$FIRST_DEP -n $NAMESPACE | grep -E "Name:|Image:|Replicas:|Labels:|Selector:|NewReplicaSet:|OldReplicaSets:"

echo ""
echo "========================================"
echo "8. SAMPLE — RECENT EVENTS"
echo "========================================"
kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | tail -20
