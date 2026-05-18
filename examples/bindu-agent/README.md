# Serving Dutch-Law-MCP as a Bindu agent

A complete, end-to-end example of how to take this Model Context
Protocol server and turn it into a fully networked, identity-bearing
agent on **[Bindu](https://github.com/getbindu/Bindu)** — a
decentralized framework for building autonomous AI agents as
microservices.

> This example is a teaching walk-through. Each step explains *why*
> before *how*, so you can adapt the pattern to other MCP servers or
> other Bindu deployments. By the end you will have a Dutch-law
> agent that speaks the A2A protocol over HTTP, advertises itself in
> a `.well-known` agent card, and signs every artifact it returns
> with an Ed25519 key derived from its decentralized identifier.

---

## Why pair Dutch-Law-MCP with Bindu?

The Model Context Protocol is excellent at *delivering tools to a
language model*. It does not, by itself, tell the outside world
anything about the agent using those tools. A second agent — or a
human user reaching the system over the network — has no way to ask
"what is this agent, what does it know, can I trust the response it
just gave me?".

That is exactly the question **Bindu** answers. Bindu wraps an
ordinary in-process agent and produces:

1. A **decentralized identity** of the form
   `did:bindu:<author>:<name>:<uuid>`, derived deterministically from
   the agent's config so the same code always mints the same DID.
2. A discoverable **agent card** at `/.well-known/agent.json` listing
   the agent's skills, capabilities, input modes, output modes, and
   trust posture.
3. A JSON-RPC 2.0 endpoint that speaks the **A2A protocol** — the
   agent-to-agent message format used by the rest of the Bindu fleet.
4. **Ed25519 signatures on every artifact** the agent returns, bound
   to the agent's DID, so downstream consumers can verify origin
   without trusting the transport.

In short: MCP gives Lex-NL its eyes (tools over the Dutch corpus);
Bindu gives Lex-NL a name, an address, and a passport.

---

## Architecture

```
        ┌────────────────────────────────────────────────────────┐
        │ Client (curl, another Bindu agent, the inbox UI, …)    │
        └────────────────────────────────────────────────────────┘
                              │ JSON-RPC 2.0 (A2A protocol)
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ Bindu agent server  —  http://localhost:3773           │
        │   • /.well-known/agent.json  (agent card + DID)        │
        │   • /did/resolve              (DID document)           │
        │   • message/send, tasks/get   (JSON-RPC methods)       │
        │   • Ed25519-signs every artifact                       │
        └────────────────────────────────────────────────────────┘
                              │ bindufy(config, handler)
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ Agno Agent  (`Lex-NL`)  +  Windsurf-style prompt       │
        └────────────────────────────────────────────────────────┘
                              │ Agno MCPTools (stdio)
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ @ansvar/dutch-law-mcp   (this repo, npm package)       │
        │   • 18 MCP tools                                       │
        │   • SQLite FTS5 over the BWB corpus                    │
        └────────────────────────────────────────────────────────┘
```

Two boundaries are worth pausing on:

- The **stdio boundary** between Bindu and this MCP server. Bindu
  spawns `node dist/index.js` (this repository's built MCP server)
  once and reuses the connection for the lifetime of the agent.
- The **HTTP boundary** between Bindu and the outside world. This is
  where the DID, the signatures, and the JSON-RPC schema live.

---

## Prerequisites

| Requirement       | Why                                                                |
| ----------------- | ------------------------------------------------------------------ |
| Python ≥ 3.12     | Bindu requires 3.12+.                                              |
| `uv`              | Used to manage the example's virtual environment.                  |
| Node.js ≥ 18      | To build and run this repository's MCP server.                     |
| An LLM API key    | Either `OPENROUTER_API_KEY` or `OPENAI_API_KEY`. OpenRouter works  |
|                   | well for non-US users and is preferred by this example.            |
| ~150 MB free disk | The MCP server's pre-built SQLite corpus.                          |

---

## Step 1 — Build the Dutch-Law-MCP server from source

From the repository root (the `Dutch-law-mcp/` directory):

```bash
npm install
npm run build
```

The build produces `dist/index.js` — the stdio MCP server that Bindu
will spawn. The first time the server starts it will fetch the
pre-built SQLite corpus (`database.db`, ~50 MB compressed, ~130 MB
extracted) into `~/.cache/dutch-law-mcp/` unless `data/database.db`
is already present in this repository.

---

## Step 2 — Install the Bindu example

```bash
cd examples/bindu-agent
cp .env.example .env       # then edit .env with your API key
uv sync                    # installs bindu, agno, openai, mcp, python-dotenv
```

If you prefer `pip`:

```bash
pip install bindu agno openai mcp python-dotenv
```

---

## Step 3 — Configure the model backend

Open `.env` and set **one** of the following:

```bash
# Option A — OpenRouter (recommended)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o

# Option B — OpenAI direct
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

You may use any OpenRouter model slug — `anthropic/claude-3.7-sonnet`,
`google/gemini-2.5-pro`, and `meta-llama/llama-3.3-70b-instruct` all
work. The agent's behaviour is shaped almost entirely by the prompt
in `prompt.py`, so the model choice is mostly a quality-versus-cost
trade-off.

---

## Step 4 — Launch the Bindu agent

```bash
uv run python bindu_agent.py
```

On a successful launch you will see Bindu print its identity, its
endpoints, and its uvicorn banner:

```
Agent ID: cded12e6-24ec-efca-d5ce-bd55e97e2e56
Agent DID:
  did:bindu:bindu_builder_at_getbindu_com:dutch_law_agent:cded12e6-…

Protocol Endpoints:
  - Agent Endpoint:  http://localhost:3773/
  - Agent Card:      http://localhost:3773/.well-known/agent.json
  - DID Resolution:  http://localhost:3773/did/resolve

INFO:     Uvicorn running on http://localhost:3773
```

Notice the DID is deterministic — it is `sha256(author + name)`
truncated to 32 hex characters and formatted as a UUID. The same
config always produces the same DID, which is how Bindu keeps agent
identities stable across redeploys.

> **What is happening under the hood?** On the very first request,
> the agent lazily spawns `node dist/index.js` (this repository's
> built MCP server). The MCP server opens the SQLite corpus
> read-only with FTS5 and serves the 18 MCP tools over stdio. Bindu
> and the MCP keep talking to each other over that stdio pipe for
> the rest of the agent's life.

---

## Step 5 — Inspect the agent card

Before asking the agent anything, look at how it advertises itself.
This is what any other Bindu agent on the network would discover:

```bash
curl -s http://localhost:3773/.well-known/agent.json | python -m json.tool
```

Key fields to notice:

| Field                          | What it tells a caller                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `id`                           | The agent's UUID — same value embedded in the DID.                            |
| `capabilities.extensions`      | The active Bindu extensions; you will see the DID extension here.             |
| `skills[].name`                | The named skill the agent has registered (`dutch-law-research`).              |
| `defaultInputModes` / `Output` | The MIME types the agent will accept and produce.                             |
| `agentTrust`                   | The trust posture; defaults to permissive in local development.               |

If you also resolve the DID document, you get the agent's public
key — which is what you will use to verify the signatures in step 5:

```bash
curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen | tr A-Z a-z)\",
       \"method\":\"did/resolve\",
       \"params\":{\"did\":\"<paste-the-DID-here>\"}}" | python -m json.tool
```

---

## Step 6 — Ask the agent a question (the full A2A round-trip)

The A2A protocol is JSON-RPC 2.0 with a strict schema. Three small
points trip up most newcomers, so we will name them up front:

1. The JSON-RPC top-level `id`, plus `message_id`, `context_id`, and
   `task_id`, **must all be UUIDs**.
2. `params.message.kind` must literally be the string `"message"`.
3. `params.configuration.accepted_output_modes` is required.

The example below uses the shell to mint fresh UUIDs and then makes
two calls: one to start the task, one to fetch its result.

```bash
# Mint UUIDs for the JSON-RPC envelope and the message identifiers.
MID=$(uuidgen | tr A-Z a-z)
CID=$(uuidgen | tr A-Z a-z)
TID=$(uuidgen | tr A-Z a-z)

# 1) Send the question. The server returns the task it has just
#    created. Capture its real task_id — Bindu assigns its own and
#    will ignore the one you proposed if it does not match server
#    state.
RESP=$(curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d @- <<JSON
{
  "jsonrpc": "2.0",
  "id": "$MID",
  "method": "message/send",
  "params": {
    "configuration": {
      "accepted_output_modes": ["text/plain", "text/markdown"]
    },
    "message": {
      "message_id": "$MID",
      "context_id": "$CID",
      "task_id":    "$TID",
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Wat zegt artikel 6:162 BW over onrechtmatige daad? Geef de tekst verbatim met BWB-citatie."
        }
      ]
    }
  }
}
JSON
)
SERVER_TID=$(echo "$RESP" | python -c "import json,sys;print(json.load(sys.stdin)['result']['id'])")
echo "Bindu accepted task: $SERVER_TID"

# 2) Poll until the task is complete. In production you would use
#    streaming or push notifications instead, but polling is the
#    simplest way to see the lifecycle.
while : ; do
  STATE=$(curl -s -X POST http://localhost:3773/ \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen | tr A-Z a-z)\",
         \"method\":\"tasks/get\",
         \"params\":{\"task_id\":\"$SERVER_TID\"}}" \
    | python -c "import json,sys;print(json.load(sys.stdin)['result']['status']['state'])")
  echo "task state: $STATE"
  [ "$STATE" = "completed" ] && break
  sleep 1
done

# 3) Fetch the final artifact.
curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen | tr A-Z a-z)\",
       \"method\":\"tasks/get\",
       \"params\":{\"task_id\":\"$SERVER_TID\"}}" \
  | python -m json.tool
```

A successful response looks something like this (trimmed for
readability):

```json
{
  "result": {
    "id": "7283450c-678b-449d-87bd-a283f98e0ec7",
    "status": { "state": "completed", "timestamp": "..." },
    "artifacts": [
      {
        "artifact_id": "6fa0cfec-70a4-481d-85ee-16c38b506e93",
        "name": "result",
        "parts": [
          {
            "kind": "text",
            "text": "Artikel 6:162 van het Burgerlijk Wetboek Boek 6 over onrechtmatige daad luidt als volgt: …\n\n**Bron**: Burgerlijk Wetboek Boek 6 (BWBR0005289) art. 6:162",
            "metadata": {
              "did.message.signature": "5a8kqjwKKSAxdJhPWyzn7DeWGp6VQXuwyncHmMCkdna6MFcDVRG3p3VEGB51ibGisw4kDRUEZonSK1WZWx5Ybc1Q"
            }
          }
        ]
      }
    ]
  }
}
```

The `did.message.signature` field is the part that makes Bindu
materially different from a plain HTTP wrapper. It is the agent
asserting cryptographically: *this exact text was produced by the
DID listed in my agent card*. Any other Bindu agent can verify the
signature against the public key from `/did/resolve` and reject the
artifact if it has been tampered with in transit.

---

## Try it out — verified sample requests and responses

Two pairs captured from a real run against this example. Both prove
the agent reached the BWB corpus (rather than answering from the
model's training data): `list_sources` returns provenance metadata
that the model would have no way to fabricate, and `get_provision`
returns the SQLite-stored text of a specific article verbatim.

### Sample 1 — `list_sources` (the corpus identifies itself)

**Request**

```bash
MID=$(uuidgen | tr A-Z a-z); CID=$(uuidgen | tr A-Z a-z); TID=$(uuidgen | tr A-Z a-z)

curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d @- <<JSON
{
  "jsonrpc": "2.0",
  "id": "$MID",
  "method": "message/send",
  "params": {
    "configuration": { "accepted_output_modes": ["text/plain"] },
    "message": {
      "message_id": "$MID",
      "context_id": "$CID",
      "task_id":    "$TID",
      "kind": "message",
      "role": "user",
      "parts": [
        { "kind": "text",
          "text": "Call the list_sources tool. Then quote me the name, authority, license, and coverage of the FIRST source entry, verbatim. No other text." }
      ]
    }
  }
}
JSON
```

**Response** (text part of the artifact, with Bindu signature)

```text
- Name: Wetten.overheid.nl
- Authority: Dutch Government (Overheid.nl)
- License: Government Open Data (CC0)
- Coverage: All consolidated Dutch statutes, AMvBs, and ministerial regulations

[Bindu Ed25519 signature: 263RjxS3qH6upxxi4TkKyjdVaTZF3uDeKRXWujkekdtgC4Hbda…]
```

The four fields match exactly what a direct stdio probe of the
`list_sources` MCP tool returns — confirming the agent reached the
corpus rather than answering from prior knowledge.

### Sample 2 — `get_provision` (verbatim statute text)

**Request**

Same envelope as above, with the `text` part replaced by:

```text
Wat zegt artikel 6:162 BW over onrechtmatige daad? Geef de tekst verbatim met BWB-citatie.
```

**Response** (text part of the artifact)

```text
Artikel 6:162 BW over onrechtmatige daad luidt als volgt:

> Hij die jegens een ander een onrechtmatige daad pleegt, welke hem kan worden toegerekend, is verplicht de schade die de ander dientengevolge lijdt, te vergoeden.
> Als onrechtmatige daad worden aangemerkt een inbreuk op een recht en een doen of nalaten in strijd met een wettelijke plicht of met hetgeen volgens ongeschreven recht in het maatschappelijk verkeer betaamt, een en ander behoudens de aanwezigheid van een rechtvaardigingsgrond.
> Een onrechtmatige daad kan aan de dader worden toegerekend, indien zij te wijten is aan zijn schuld of aan een oorzaak welke krachtens de wet of de in het verkeer geldende opvattingen voor zijn rekening komt.

Bron: [Burgerlijk Wetboek Boek 6, Verbintenissenrecht (BWBR0005289) art. 6:162](https://wetten.overheid.nl/BWBR0005289).

[Bindu Ed25519 signature: 2QQYd9BWfHgKQkeVM8XFfTCFgqCijGMbN6VE2xRm4DN24V1d9F…]
```

The agent followed the citation rules from `prompt.py`: a one-line
introduction, the operative text in a blockquote verbatim from
`get_provision`, and a final citation in
`Burgerlijk Wetboek Boek 6 (BWBR0005289) art. 6:162` form.

### Latency

On a 2024-era laptop with `openai/gpt-4o` via OpenRouter:

| Request | End-to-end latency | Notes |
| --- | --- | --- |
| First request after agent start | ~5–7 seconds | Includes the node `dist/index.js` cold-start and the initial MCPTools handshake. |
| Subsequent requests | ~3–5 seconds | The MCP connection is held open for the agent's lifetime, so only the model round-trip and a single tool call add latency. |

---

## More sample queries

Below are five more questions, each chosen to exercise a different
tool in the Dutch-Law-MCP. Replace the `text` field in the
`message/send` call from step 6 with any of these.

```text
Is artikel 24 van de Mededingingswet nog van kracht? Eén zin met BWB-citatie.
```
*Exercises `check_currency` followed by `get_provision`.*

```text
Welke EU-verordening implementeert de Nederlandse Uitvoeringswet AVG?
```
*Exercises `get_provision_eu_basis` and the EU bridge.*

```text
Valideer de citatie 'art. 6:162 BW' en geef het document_id terug.
```
*Exercises `validate_citation` (note the short-code form — `BW`).*

```text
Find Dutch provisions about trade secrets, then summarise the corpus's freshness.
```
*Exercises `search_legislation` and `check_data_freshness`.*

```text
Wat zegt de APV van Amsterdam over geluidsoverlast in de horeca?
```
*Should be refused: municipal law is out of scope per the agent's
prompt.*

You can also drive the agent from another Bindu agent — the same
JSON-RPC schema is what every Bindu service speaks.

---

## File layout

```
examples/bindu-agent/
├── README.md                       (this file)
├── bindu_agent.py                  (the bindufied agent)
├── prompt.py                       (Windsurf-style system prompt)
├── pyproject.toml                  (bindu, agno, openai, mcp, python-dotenv)
├── .env.example                    (LLM provider + key)
└── skills/
    └── dutch-law-research/
        └── skill.yaml              (Bindu skill manifest)
```

---

## Glossary

| Term            | Meaning                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Bindu**       | A decentralized agent framework. Wraps an agent in a DID identity, a JSON-RPC server, and signed artifacts.      |
| **A2A**         | Agent-to-agent protocol. JSON-RPC 2.0 with a Bindu-specific schema for `message/send`, `tasks/get`, and friends. |
| **DID**         | Decentralized identifier. Here: `did:bindu:<author>:<name>:<uuid>`, derived from the agent's config.             |
| **Skill**       | A named capability the agent advertises in its agent card.                                                       |
| **Artifact**    | A unit of agent output (text, file, structured data) returned as part of a task result. Bindu signs every one.   |
| **Lex-NL**      | The conventional Bindu name for this Dutch-law agent.                                                            |

---

## Further reading

- **Bindu**: <https://github.com/getbindu/Bindu> · <https://docs.getbindu.com>
- **Agno**: <https://docs.agno.com>
- **Dutch-Law-MCP** (this repository): the source of the 18 MCP tools.
- **A2A protocol**: see `bindu/common/protocol/types.py` in the Bindu
  source for the canonical schemas.

---

## Disclaimer

This example is a research demonstration. The Dutch-Law-MCP corpus
covers federal (rijks) legislation only, and the agent is **not**
legal advice. For any matter that requires advice, consult a
qualified Dutch advocaat. Always verify critical citations against
[wetten.overheid.nl](https://wetten.overheid.nl) before relying on
them in professional legal work.
