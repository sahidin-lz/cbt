import React, { useMemo } from 'react';
import katex from 'katex';

interface MathAndTableRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

/**
 * Checks if a string contains HTML table tags
 */
function hasHtmlTable(text: string): boolean {
  return /<table[\s>]/i.test(text) && /<\/table>/i.test(text);
}

/**
 * Checks if a string contains Markdown table pattern
 */
function hasMarkdownTable(text: string): boolean {
  return /\|[^\n]+\|[^\n]*\n\|[\s:-|-]+\|[^\n]*\n\|[^\n]+\|/m.test(text);
}

/**
 * Parses markdown table into headers and rows
 */
function parseMarkdownTable(mdText: string): { headers: string[]; rows: string[][] } | null {
  const lines = mdText.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const headerLine = lines[0];
  const dividerLine = lines[1];
  if (!dividerLine.includes('-') || !dividerLine.includes('|')) return null;

  const cleanRow = (rowStr: string) =>
    rowStr
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = cleanRow(headerLine);
  const rows = lines.slice(2).map(cleanRow);

  return { headers, rows };
}

/**
 * Renders a segment of text with inline math ($...$ or \(...\)) and sub/sup
 */
const MathInlineSegment: React.FC<{ text: string }> = ({ text }) => {
  const parts = useMemo(() => {
    // Regex matches:
    // 1. Display math: $$...$$ or \[...\]
    // 2. Inline math: $...$ or \(...\)
    // 3. HTML sub/sup tags: <sub>...</sub>, <sup>...</sup>
    const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\)|<sup>[\s\S]*?<\/sup>|<sub>[\s\S]*?<\/sub>)/g;
    const splitParts = text.split(mathRegex);

    return splitParts.map((segment, idx) => {
      if (!segment) return null;

      // Display math $$...$$
      if (
        (segment.startsWith('$$') && segment.endsWith('$$') && segment.length >= 4) ||
        (segment.startsWith('\\[') && segment.endsWith('\\]') && segment.length >= 4)
      ) {
        const rawFormula = segment.startsWith('$$')
          ? segment.slice(2, -2).trim()
          : segment.slice(2, -2).trim();
        try {
          const renderedHtml = katex.renderToString(rawFormula, {
            displayMode: true,
            throwOnError: false,
          });
          return (
            <span
              key={idx}
              className="my-2.5 block text-center overflow-x-auto py-1"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        } catch {
          return (
            <span key={idx} className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-800">
              {rawFormula}
            </span>
          );
        }
      }

      // Inline math $...$
      if (
        (segment.startsWith('$') && segment.endsWith('$') && segment.length >= 2) ||
        (segment.startsWith('\\(') && segment.endsWith('\\)') && segment.length >= 4)
      ) {
        const rawFormula = segment.startsWith('$')
          ? segment.slice(1, -1).trim()
          : segment.slice(2, -2).trim();
        try {
          const renderedHtml = katex.renderToString(rawFormula, {
            displayMode: false,
            throwOnError: false,
          });
          return (
            <span
              key={idx}
              className="inline-block px-0.5 align-baseline"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        } catch {
          return (
            <span key={idx} className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-800">
              {rawFormula}
            </span>
          );
        }
      }

      // HTML <sup> and <sub>
      if (segment.startsWith('<sup>') && segment.endsWith('</sup>')) {
        return (
          <sup key={idx} className="text-[75%] font-medium text-slate-800">
            {segment.slice(5, -6)}
          </sup>
        );
      }
      if (segment.startsWith('<sub>') && segment.endsWith('</sub>')) {
        return (
          <sub key={idx} className="text-[75%] font-medium text-slate-800">
            {segment.slice(5, -6)}
          </sub>
        );
      }

      // Format common math patterns (e.g. x^2, x_1, etc.)
      return (
        <span key={idx}>
          {segment}
        </span>
      );
    });
  }, [text]);

  return <>{parts}</>;
};

/**
 * Comprehensive Math & Table Content Renderer
 */
export const MathAndTableRenderer: React.FC<MathAndTableRendererProps> = ({
  content,
  className = '',
  inline = false,
}) => {
  if (!content) return null;

  // 1. If content contains HTML Table
  if (hasHtmlTable(content)) {
    return (
      <div className={`overflow-x-auto my-2 rounded-lg border border-slate-300 bg-white ${className}`}>
        <div
          className="cbt-html-table p-2 text-xs sm:text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:bg-slate-100 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2.5 [&_th]:font-bold [&_th]:text-slate-800 [&_td]:border [&_td]:border-slate-200 [&_td]:p-2.5 [&_td]:text-slate-700 [&_tr:hover]:bg-blue-50/30"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }

  // 2. If content contains Markdown Table
  if (hasMarkdownTable(content)) {
    const tableData = parseMarkdownTable(content);
    if (tableData) {
      return (
        <div className={`overflow-x-auto my-3 rounded-lg border border-slate-300 shadow-xs bg-white ${className}`}>
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                {tableData.headers.map((h, i) => (
                  <th key={i} className="py-2.5 px-3.5 font-bold text-slate-800 border-r last:border-r-0 border-slate-300">
                    <MathInlineSegment text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tableData.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="py-2.5 px-3.5 text-slate-700 border-r last:border-r-0 border-slate-200">
                      <MathInlineSegment text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  // 3. Standard Text with potential math or paragraphs
  if (inline) {
    return (
      <span className={className}>
        <MathInlineSegment text={content} />
      </span>
    );
  }

  // Multi-line paragraphs
  const paragraphs = content.split(/\n\s*\n/);
  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {paragraphs.map((p, idx) => (
        <div key={idx} className="whitespace-pre-line">
          <MathInlineSegment text={p} />
        </div>
      ))}
    </div>
  );
};
