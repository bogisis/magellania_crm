# [HTTP METHOD] [Endpoint Path]

> **Brief description of what this endpoint does**

---

## 📋 Overview

**Purpose:** What this endpoint is used for

**Authentication:** Required / Not Required

**Rate Limit:** If applicable

**Since version:** X.Y.Z

---

## 🔗 Request

### HTTP Method and URL

```
[METHOD] /api/[resource]/[path]
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param1` | string | Yes | Description of param1 |
| `param2` | number | No | Description of param2 (default: value) |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query1` | string | No | Description of query1 |
| `query2` | boolean | No | Description of query2 |

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `Authorization` | If auth | `Bearer <token>` |

### Request Body

**Content-Type:** `application/json`

```json
{
  "field1": "string",
  "field2": 123,
  "field3": {
    "nested": "value"
  }
}
```

**Field Descriptions:**
- `field1` (string, required) - Description
- `field2` (number, optional) - Description (default: value)
- `field3` (object, optional) - Description

---

## ✅ Response

### Success Response

**Status Code:** `200 OK`

**Content-Type:** `application/json`

```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "field1": "value",
    "field2": 123,
    "created_at": 1234567890
  },
  "message": "Success message"
}
```

**Response Fields:**
- `success` (boolean) - Always `true` for successful requests
- `data` (object) - The response data
  - `id` (string) - Resource identifier
  - `field1` (string) - Description
  - `field2` (number) - Description
  - `created_at` (integer) - Unix timestamp
- `message` (string, optional) - Human-readable success message

---

## ❌ Error Responses

### 400 Bad Request

Invalid input data

```json
{
  "success": false,
  "error": "Invalid input: field1 is required"
}
```

---

### 404 Not Found

Resource not found

```json
{
  "success": false,
  "error": "Resource not found: id-123"
}
```

---

### 409 Conflict

Concurrent modification detected

```json
{
  "success": false,
  "error": "Concurrent modification detected. Please reload and try again."
}
```

---

### 500 Internal Server Error

Server error

```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## 💡 Examples

### Example 1: [Common use case]

**Request:**
```bash
curl -X [METHOD] http://localhost:3000/api/[resource]/[path] \
  -H "Content-Type: application/json" \
  -d '{
    "field1": "example",
    "field2": 123
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc-123",
    "field1": "example",
    "field2": 123
  }
}
```

---

### Example 2: [Another scenario]

[Repeat pattern]

---

## 🔧 Implementation

### File Location

```
server-with-db.js:123-145
```

### Code Reference

```javascript
// Example implementation
app.[method]('/api/[resource]/[path]', async (req, res) => {
    try {
        const { field1, field2 } = req.body;

        // Validation
        if (!field1) {
            return res.status(400).json({
                success: false,
                error: 'field1 is required'
            });
        }

        // Process request
        const result = await storage.someMethod(field1, field2);

        // Success response
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
```

---

## 📊 Validation Rules

**Input validation:**
- `field1`: Non-empty string, max 100 characters
- `field2`: Positive number, 0-1000
- `field3`: Valid object with specific schema

**Business rules:**
- Rule 1 description
- Rule 2 description

---

## 🔒 Security Considerations

- Input sanitization performed
- SQL injection protected via prepared statements
- XSS prevention through JSON serialization
- File size limits enforced (if applicable)

---

## ⚡ Performance

**Expected response time:** < 100ms (typical)

**Complexity:** O(1) / O(n) / O(log n)

**Database operations:**
- 1 SELECT query
- 1 UPDATE query

---

## 🧪 Testing

### Unit Test

```javascript
describe('[METHOD] /api/[resource]/[path]', () => {
    it('should successfully process valid request', async () => {
        const response = await request(app)
            .[method]('/api/[resource]/[path]')
            .send({ field1: 'test', field2: 123 })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.field1).toBe('test');
    });

    it('should return 400 for invalid input', async () => {
        const response = await request(app)
            .[method]('/api/[resource]/[path]')
            .send({ field2: 123 }) // Missing field1
            .expect(400);

        expect(response.body.success).toBe(false);
    });
});
```

---

## 🔗 Related Endpoints

- [`GET /api/[resource]`](link) - List all resources
- [`PUT /api/[resource]/:id`](link) - Update resource
- [`DELETE /api/[resource]/:id`](link) - Delete resource

---

## 📝 Changelog

**v2.3.0** (Date)
- Endpoint added

**v2.2.0** (Date)
- Changes made

---

## 📞 Support

- 📖 [API Reference Overview](../index.md)
- 🐛 [Report API issue](https://github.com/yourorg/quote-calculator/issues)
