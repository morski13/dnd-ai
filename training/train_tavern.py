# Train our own Tavern model on Google Colab (free T4 GPU) or Kaggle. About 20–60 minutes.
# 1. Colab → Runtime → Change runtime type → T4 GPU.
# 2. Upload tavern-training.jsonl (from: node scripts/export-training.mjs) with the folder icon on the left.
# 3. Paste this whole file into one cell and run it. At the end, download tavern-gguf/*.gguf.
#
# BASE: a small open model that's good at following instructions and fits a cheap server later.
#   unsloth/Qwen3-4B-Instruct-2507  (default: 4B, Apache-2.0, runs on a 16 GB CPU server)
#   unsloth/Qwen2.5-7B-Instruct     (smarter, slower; needs ~8 GB RAM per user at a time)
#   unsloth/Llama-3.2-3B-Instruct   (smaller and faster)
BASE = "unsloth/Qwen3-4B-Instruct-2507"
DATA = "tavern-training.jsonl"
EPOCHS = 2          # 2–3 for a few hundred examples; 1 for several thousand
MAX_LEN = 4096      # our prompts with sources are ~2–3k tokens

import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "unsloth"], check=True)

from unsloth import FastLanguageModel
from unsloth.chat_templates import train_on_responses_only
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig

model, tokenizer = FastLanguageModel.from_pretrained(BASE, max_seq_length=MAX_LEN, load_in_4bit=True)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=16, lora_dropout=0, bias="none",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth", random_state=7,
)

ds = load_dataset("json", data_files=DATA, split="train")
ds = ds.map(lambda ex: {"text": tokenizer.apply_chat_template(ex["messages"], tokenize=False)})
print(len(ds), "examples")

cfg = dict(dataset_text_field="text", per_device_train_batch_size=1, gradient_accumulation_steps=8,
           num_train_epochs=EPOCHS, learning_rate=2e-4, warmup_steps=10, logging_steps=5, lr_scheduler_type="cosine",
           optim="adamw_8bit", output_dir="out", report_to="none", seed=7)
try:
    args = SFTConfig(max_length=MAX_LEN, **cfg)        # newer TRL
except TypeError:
    args = SFTConfig(max_seq_length=MAX_LEN, **cfg)    # older TRL
try:
    trainer = SFTTrainer(model=model, processing_class=tokenizer, train_dataset=ds, args=args)
except TypeError:
    trainer = SFTTrainer(model=model, tokenizer=tokenizer, train_dataset=ds, args=args)
# learn only the answers, not the rules text we send in (the model reads that every time anyway)
try:
    trainer = train_on_responses_only(trainer, instruction_part="<|im_start|>user\n", response_part="<|im_start|>assistant\n")
except Exception as e:
    print("Training on whole conversations (couldn't split by role):", e)
trainer.train()

# quick test with a real-looking question
FastLanguageModel.for_inference(model)
test = load_dataset("json", data_files=DATA, split="train")[0]["messages"][:-1]
ids = tokenizer.apply_chat_template(test, add_generation_prompt=True, return_tensors="pt").to("cuda")
print(tokenizer.decode(model.generate(input_ids=ids, max_new_tokens=300, temperature=0.3)[0][ids.shape[1]:], skip_special_tokens=True))

# save for Ollama / llama.cpp: one file, ~2.5 GB for a 4B model
model.save_pretrained_gguf("tavern-gguf", tokenizer, quantization_method="q4_k_m")
print("Done: download the .gguf file from the tavern-gguf folder.")
