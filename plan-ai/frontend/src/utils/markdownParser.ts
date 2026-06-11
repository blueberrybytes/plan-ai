import { unified } from "unified";
import remarkParse from "remark-parse";

export interface MarkdownChunk {
  id: string;
  type: string;
  rawText: string;
  startIndex: number;
  endIndex: number;
}

export const splitMarkdownIntoChunks = (markdown: string): MarkdownChunk[] => {
  if (!markdown) return [];

  try {
    const processor = unified().use(remarkParse);
    const ast = processor.parse(markdown);

    const chunks: MarkdownChunk[] = [];

    ast.children.forEach((child, index) => {
      if (
        child.position &&
        child.position.start.offset !== undefined &&
        child.position.end.offset !== undefined
      ) {
        const startIndex = child.position.start.offset;
        const endIndex = child.position.end.offset;

        chunks.push({
          id: `chunk-${index}`,
          type: child.type,
          rawText: markdown.substring(startIndex, endIndex),
          startIndex,
          endIndex,
        });
      }
    });

    return chunks;
  } catch (err) {
    console.error("Failed to parse markdown chunks:", err);
    return [];
  }
};
