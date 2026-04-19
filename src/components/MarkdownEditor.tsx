'use client';

import '@mdxeditor/editor/style.css';
import {
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  imagePlugin,
  InsertImage,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo
} from '@mdxeditor/editor';

type MarkdownEditorProps = {
  markdown: string;
  onChange: (value: string) => void;
};

export function MarkdownEditor({ markdown, onChange }: MarkdownEditorProps) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-black/8 bg-white/75">
      <MDXEditor
        markdown={markdown}
        onChange={onChange}
        contentEditableClassName="prose min-h-[220px] max-w-none px-4 py-3"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          imagePlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
              </>
            )
          })
        ]}
      />
    </div>
  );
}
