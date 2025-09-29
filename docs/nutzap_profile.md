# Nutzap profile schema

Kind `10019` events describe how to pay a creator via Cashu.

## Tags

The event MUST include the following tags:

- `["t", "nutzap-profile"]`
- ` ["client", "fundstr"]`

## Content

The `content` field is JSON with these keys:

| Key | Type | Description |
| --- | --- | --- |
| `p2pk` | string | Hex encoded pay-to-public-key. |
| `mints` | string[] | Trusted Cashu mint URLs. |
| `relays` | string[] (optional) | Relays where the creator is reachable. |
| `tierAddr` | string (optional) | Address of a `kind:30000` tier definition event. |
| `v` | number (optional) | Schema version. Current version is `1`. |

### Example

```json
{
  "kind": 10019,
  "content": "{\"v\":1,\"p2pk\":\"<hex>\",\"mints\":[\"https://mint\"],\"relays\":[\"wss://relay\"],\"tierAddr\":\"30000:<pub>:tiers\"}",
  "tags": [["t","nutzap-profile"],["client","fundstr"]]
}
```
