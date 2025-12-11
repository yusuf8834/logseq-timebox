import { useState, useRef, useEffect, useCallback } from "react";

interface UseInlineEditReturn {
  editingEventId: string | null;
  editingText: string;
  editInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  setEditingText: (text: string) => void;
  enterEditMode: (blockUuid: string) => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  cancelEdit: () => void;
}

export function useInlineEdit(onSaveComplete: () => void): UseInlineEditReturn {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Auto-focus and move cursor to end when entering edit mode
  useEffect(() => {
    if (!editingEventId) return;
    requestAnimationFrame(() => {
      const el = editInputRef.current;
      if (!el) return;
      const len = el.value.length;
      el.focus();
      el.setSelectionRange(len, len);
    });
  }, [editingEventId]);

  // Enter edit mode for a block
  const enterEditMode = useCallback(async (blockUuid: string) => {
    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (block) {
        const contentLines = (block.content || "").split("\n");
        const title = contentLines.find(
          (line: string) => !line.startsWith("SCHEDULED:") && !line.startsWith("DEADLINE:")
        ) || "";
        setEditingEventId(blockUuid);
        setEditingText(title);
        // Focus input after render
        setTimeout(() => editInputRef.current?.focus(), 50);
      }
    } catch (error) {
      console.error("Error entering edit mode:", error);
    }
  }, []);

  // Save inline edit
  const handleSaveEdit = useCallback(async () => {
    if (!editingEventId || !editingText.trim()) {
      setEditingEventId(null);
      setEditingText("");
      return;
    }

    try {
      const block = await logseq.Editor.getBlock(editingEventId);
      if (!block) {
        setEditingEventId(null);
        setEditingText("");
        return;
      }

      // Replace the title line while preserving SCHEDULED/DEADLINE lines
      const lines = (block.content || "").split("\n");
      const titleIndex = lines.findIndex(
        (line: string) => !line.startsWith("SCHEDULED:") && !line.startsWith("DEADLINE:")
      );
      if (titleIndex !== -1) {
        lines[titleIndex] = editingText;
      } else {
        lines.unshift(editingText);
      }

      await logseq.Editor.updateBlock(editingEventId, lines.join("\n"));
      logseq.UI.showMsg("Event updated", "success");
      onSaveComplete();
    } catch (error) {
      console.error("Error updating event:", error);
      logseq.UI.showMsg(`Error updating event: ${error}`, "error");
    } finally {
      setEditingEventId(null);
      setEditingText("");
    }
  }, [editingEventId, editingText, onSaveComplete]);

  // Cancel editing without saving
  const cancelEdit = useCallback(() => {
    setEditingEventId(null);
    setEditingText("");
  }, []);

  return {
    editingEventId,
    editingText,
    editInputRef,
    hoveredEventId,
    setHoveredEventId,
    setEditingText,
    enterEditMode,
    handleSaveEdit,
    cancelEdit,
  };
}

