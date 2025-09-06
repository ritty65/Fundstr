# Nutzap profile schema

Kind `10019` events describe how to pay a creator via Cashu.

## Tags

The event MUST include the following tags:

- `["version", "1"]`
- `["p2pk", "<hex>"]`
- one or more `["mint", "https://mint"]`

Optional tags:

- `["relays", "wss://relay1", "wss://relay2"]`
- `["a", "30019:<pub>:tiers"]` to reference tier definitions
- `["meta", "{...}"]` for extra structured data

## Content

The `content` field SHOULD be empty. Extra structured data can be stored in the optional `meta` tag as minified JSON.

### Example

```json
{
  "kind": 10019,
  "content": "",
  "tags": [
    ["version","1"],
    ["p2pk","<hex>"],
    ["mint","https://mint"],
    ["relays","wss://relay"],
    ["a","30019:<pub>:tiers"]
  ]
}
```
