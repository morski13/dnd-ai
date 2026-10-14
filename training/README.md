# Our own Tavern model

The Tavern assistant has two parts:

1. **The brain around the model (in the app, already ours).** For every question, the app finds the right
   rules text (SRD 5.2.1), spells, class features, feats, items, monsters, the character's sheet, the table's
   house rules and the campaign notes. It runs its own rule checks (one spell slot per turn, one bonus action,
   two concentration spells, spells while raging…) and saves which sources the answer used.
2. **The model that words the answer.** Today that's whichever AI is in `.env.local` (Groq…). Once we train
   our own, it plugs in the same way and the free-tier limits are gone.

Training teaches the model our format, our voices (tavern keeper, dwarf, lord…) and how our table answers.
The rules accuracy still comes from part 1, so even a small model gives exact answers.

## 1. Collect examples (just use the app)

- Ask the Tavern things. Tap 👍 on good answers.
- On a wrong answer tap 👎 and write the right answer: these are the most valuable examples.
- Answers that used DM-only notes are never exported.
- A few hundred examples is a good first training; a thousand or more is better.

## 2. Export

In the `dnd-ai` folder:

```
node scripts/export-training.mjs
```

This writes `training/tavern-training.jsonl`. Add `--with-unrated` to also include answers nobody rated.
That file holds your group's questions: it's in `.gitignore`, keep it out of GitHub.

## 3. Train (free, in the browser)

1. Open https://colab.research.google.com, **New notebook**.
2. **Runtime → Change runtime type → T4 GPU**.
3. Upload `tavern-training.jsonl` with the folder icon on the left.
4. Paste all of `training/train_tavern.py` into a cell and run it (20–60 minutes).
5. Download the `.gguf` file from the `tavern-gguf` folder and rename it to `tavern-q4_k_m.gguf`.

Kaggle notebooks (30 free GPU hours a week) work the same way.

## 4. Run it

Our model needs a computer that's always on. Options we looked at (October 2026):

| Where | Cost | Speed for a 4B model | Notes |
|---|---|---|---|
| Rented server, 16 GB RAM (e.g. Hetzner) | ~€8–15 / month | ~8–12 words/sec | Always on, no limits, fine for 5–7 people |
| Oracle Always Free | €0 | ~3–5 words/sec | Cut to 2 CPUs / 12 GB in June 2026; one person at a time |
| GPU rented only during sessions (RunPod, Vast) | ~€0.20–0.40 / hour | fast, even 8B | You start/stop it; Groq covers the rest of the week |

On the server (Linux):

```
curl -fsSL https://ollama.com/install.sh | sh
ollama create tavern -f Modelfile        # with tavern-q4_k_m.gguf next to the Modelfile
```

Don't open Ollama to the whole internet without a key. Put Caddy in front of it so only requests with
your key get through (`/etc/caddy/Caddyfile`):

```
ai.your-domain.com {
  @key header Authorization "Bearer CHANGE-ME-LONG-RANDOM-KEY"
  handle @key { reverse_proxy localhost:11434 }
  respond 401
}
```

## 5. Switch the app to it

In `.env.local` (and in Vercel's environment variables), our model goes first and Groq stays as the backup:

```
AI_BASE_URL=https://ai.your-domain.com/v1
AI_MODEL=tavern
AI_API_KEY=CHANGE-ME-LONG-RANDOM-KEY
AI_NAME=tavern

AI_2_BASE_URL=https://api.groq.com/openai/v1
AI_2_MODEL=openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b
AI_2_API_KEY=gsk_...
```

Restart the app. Answers then say "Worded by tavern · tavern". If the server is off, Groq answers on its own.

## Train again later

The more the group uses and rates the Tavern, the better the next training. Export and train again every
month or two; replace the `.gguf` on the server and run `ollama create tavern -f Modelfile` again.
