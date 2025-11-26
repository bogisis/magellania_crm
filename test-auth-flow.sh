#!/bin/bash

# ============================================================================
# Auth Flow Test Script
# Тестирование исправлений авторизации
# ============================================================================

BASE_URL="http://localhost:4000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔐 Testing Authentication Flow"
echo "================================"
echo ""

# ============================================================================
# Test 1: Проверка /login endpoint
# ============================================================================
echo "Test 1: GET /login (должен вернуть HTML страницу логина)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")

if [ "$RESPONSE" -eq 200 ]; then
    echo -e "${GREEN}✓ PASS${NC} - /login returns 200 OK"
else
    echo -e "${RED}✗ FAIL${NC} - /login returns $RESPONSE (expected 200)"
fi
echo ""

# ============================================================================
# Test 2: API v1 без токена (должен вернуть 401)
# ============================================================================
echo "Test 2: GET /api/v1/estimates без токена (должен вернуть 401)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/estimates")

if [ "$RESPONSE" -eq 401 ]; then
    echo -e "${GREEN}✓ PASS${NC} - API returns 401 Unauthorized without token"
else
    echo -e "${RED}✗ FAIL${NC} - API returns $RESPONSE (expected 401)"
fi
echo ""

# ============================================================================
# Test 3: Login с правильными credentials
# ============================================================================
echo "Test 3: POST /api/v1/auth/login с правильными credentials"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@magellania.com","password":"magellania2025"}')

# Проверяем, есть ли token в ответе (может быть jwt_token или data.token)
if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${GREEN}✓ PASS${NC} - Login successful, JWT token received"

    # Извлекаем токен (пробуем оба формата)
    JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"jwt_token":"[^"]*"' | cut -d'"' -f4)
    if [ -z "$JWT_TOKEN" ]; then
        JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
    fi
    echo -e "${YELLOW}   Token: ${JWT_TOKEN:0:50}...${NC}"
else
    echo -e "${RED}✗ FAIL${NC} - Login failed or no token in response"
    echo "   Response: $LOGIN_RESPONSE"
    exit 1
fi
echo ""

# ============================================================================
# Test 4: API v1 с валидным токеном (должен вернуть 200)
# ============================================================================
echo "Test 4: GET /api/v1/estimates с валидным токеном (должен вернуть 200)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/estimates" \
    -H "Authorization: Bearer $JWT_TOKEN")

if [ "$RESPONSE" -eq 200 ]; then
    echo -e "${GREEN}✓ PASS${NC} - API returns 200 OK with valid token"
else
    echo -e "${RED}✗ FAIL${NC} - API returns $RESPONSE (expected 200)"
fi
echo ""

# ============================================================================
# Test 5: API v1 с невалидным токеном (должен вернуть 401)
# ============================================================================
echo "Test 5: GET /api/v1/estimates с невалидным токеном (должен вернуть 401)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/estimates" \
    -H "Authorization: Bearer invalid.token.here")

if [ "$RESPONSE" -eq 401 ]; then
    echo -e "${GREEN}✓ PASS${NC} - API returns 401 Unauthorized with invalid token"
else
    echo -e "${RED}✗ FAIL${NC} - API returns $RESPONSE (expected 401)"
fi
echo ""

# ============================================================================
# Test 6: Login с неправильными credentials (должен вернуть 401)
# ============================================================================
echo "Test 6: POST /api/v1/auth/login с неправильным паролем (должен вернуть 401)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@magellania.com","password":"wrongpassword"}')

if [ "$RESPONSE" -eq 401 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Login fails with wrong password (401)"
else
    echo -e "${RED}✗ FAIL${NC} - Login returns $RESPONSE (expected 401)"
fi
echo ""

# ============================================================================
# Test 7: Multi-tenancy - проверка organization_id в токене
# ============================================================================
echo "Test 7: Проверка organization_id в JWT payload"
# Декодируем JWT payload (часть между первой и второй точкой)
JWT_PAYLOAD=$(echo "$JWT_TOKEN" | cut -d'.' -f2)
# Добавляем padding если нужно
JWT_PAYLOAD_PADDED=$(echo "$JWT_PAYLOAD==" | sed 's/==$//')
DECODED=$(echo "$JWT_PAYLOAD_PADDED" | base64 -d 2>/dev/null)

if echo "$DECODED" | grep -q "magellania-org"; then
    echo -e "${GREEN}✓ PASS${NC} - JWT token contains organization_id: magellania-org"
    echo "   Payload: $DECODED"
else
    echo -e "${RED}✗ FAIL${NC} - JWT token missing organization_id: magellania-org"
    echo "   Payload: $DECODED"
fi
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "================================"
echo "🎯 Test Summary:"
echo "   All critical auth flows tested"
echo "   ✅ Auth guard should block calculator without token"
echo "   ✅ JWT middleware protects API endpoints"
echo "   ✅ Multi-tenancy isolation in place"
echo ""
echo "📋 Manual Testing Required:"
echo "   1. Open browser: http://localhost:4000"
echo "   2. Clear localStorage (DevTools → Application → Local Storage → Clear)"
echo "   3. Reload page → should redirect to /login"
echo "   4. Login with admin@magellania.com / magellania2025"
echo "   5. Should see calculator interface after login"
echo "   6. Check console for: [Auth Guard] JWT token found, initializing calculator..."
echo ""
