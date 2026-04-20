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
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/cn';

type MarkdownEditorProps = {
  markdown: string;
  onChange: (value: string) => void;
};

export function MarkdownEditor({ markdown, onChange }: MarkdownEditorProps) {
  const { theme } = useTheme();

  return (
    <div className={cn('meridian-editor-shell overflow-hidden rounded-[1.25rem]', theme)}>
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
