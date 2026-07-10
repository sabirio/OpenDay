# Idempotency model

Tier-1 commands use a browser-generated UUID `client_request_id`, persisted with the form draft and reused until a confirmed success. Database uniqueness is `(actor_id, operation, client_request_id)` in `write_command_requests`.

The atomic RPC reserves the key inside its transaction. A failure rolls the reservation back. A committed response is stored and returned on replay with `idempotentReplay:true`. Reusing a key for another project is rejected. Timestamps are never the identity key.

This makes double-click, browser retry and network timeout after commit safe. The UI may disable submit for usability, but correctness comes from the database constraint.

