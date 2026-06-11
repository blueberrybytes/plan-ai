import { convertMarkdownToDocx } from "@mohtasham/md-to-docx";
import { saveAs } from "file-saver";

export async function exportMarkdownToDocx(title: string, markdown: string) {
  // Prepend the title as an H1 heading so it appears prominently in the document
  const content = `# ${title}\n\n${markdown}`;

  // Use the library to accurately parse all markdown features (tables, lists, bold, etc)
  const blob = await convertMarkdownToDocx(content);
  saveAs(blob, `${title}.docx`);
}
