#!/bin/bash
# Мониторинг здоровья контейнеров

check_service() {
    local name=$1
    local url=$2

    if curl -f $url > /dev/null 2>&1; then
        echo "✅ $name: healthy"
        return 0
    else
        echo "❌ $name: unhealthy"
        return 1
    fi
}

echo "🏥 Health Check Report"
echo "====================="

check_service "Production" "http://localhost:3005/health"
PROD_STATUS=$?

check_service "Staging" "http://localhost:3006/health"
STAGING_STATUS=$?

if [ $PROD_STATUS -eq 0 ] && [ $STAGING_STATUS -eq 0 ]; then
    echo ""
    echo "✅ All systems operational"
    exit 0
else
    echo ""
    echo "❌ Some systems are down!"
    exit 1
fi
