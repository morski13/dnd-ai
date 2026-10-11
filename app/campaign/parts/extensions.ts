// Editor building blocks shared by the DM's editor and the players' reader.
import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    secret: { toggleSecret: () => ReturnType };
  }
}

/** A "DM only" block. Players never receive what's inside (the server removes it). */
export const Secret = Node.create({
  name: "secret",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-secret]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-secret": "", class: "dm-secret" }), 0];
  },
  addCommands() {
    return {
      toggleSecret: () => ({ editor, commands }) => (editor.isActive("secret") ? commands.lift("secret") : commands.wrapIn("secret")),
    };
  },
  addKeyboardShortcuts() {
    return {
      // Enter on an empty last line inside a DM-only block steps out of it (like leaving a list)
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.depth < 2) return false;
        const box = $from.node(-1);
        const atEnd = $from.index(-1) === box.childCount - 1;
        if (box.type.name !== "secret" || !atEnd || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) return false;
        return editor.commands.lift("secret");
      },
    };
  },
});

export const FONTS = [
  { label: "Default", value: "" },
  { label: "Spectral", value: "var(--font-spectral), Georgia, serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Typewriter", value: "'Courier New', Courier, monospace" },
  { label: "Clean", value: "'Helvetica Neue', Arial, sans-serif" },
];
export const SIZES = ["12px", "14px", "16px", "18px", "22px", "28px"];

export function extensions(opts: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
      link: { openOnClick: true, autolink: true, protocols: ["https", "http"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "vault-img", loading: "lazy" } }),
    Secret,
    Placeholder.configure({ placeholder: opts.placeholder ?? "Start writing…" }),
  ];
}
