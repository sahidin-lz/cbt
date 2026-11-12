import React, { useMemo, useState } from 'react';
import katex from 'katex';

interface MathAndTableRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

/**
 * Converts \ce{...} chemistry notation (like \ce{H2SO4}, \ce{2H2 + O2 -> 2H2O}, \ce{SO4^2-})
 * and common Word/Physics equation shorthands into valid KaTeX LaTeX syntax.
 */
export function normalizeFormulaForKatex(rawFormula: string): string {
  if (!rawFormula) return '';
  let f = rawFormula.trim();

  // Convert \ce{...} blocks into standard KaTeX \text{} with subscripts/superscripts and reaction arrows
  f = f.replace(/\\ce\{([^{}]+)\}/g, (_match, inner: string) => {
    return convertChemStringToLatex(inner);
  });

  // Replace common Unicode math/physics/chemistry symbols with LaTeX commands
  f = f
    .replace(/⇌/g, '\\rightleftharpoons ')
    .replace(/→/g, '\\rightarrow ')
    .replace(/←/g, '\\leftarrow ')
    .replace(/↔/g, '\\leftrightarrow ')
    .replace(/<=>/g, '\\rightleftharpoons ')
    .replace(/->/g, '\\rightarrow ')
    .replace(/×/g, '\\times ')
    .replace(/÷/g, '\\div ')
    .replace(/±/g, '\\pm ')
    .replace(/∓/g, '\\mp ')
    .replace(/≤/g, '\\le ')
    .replace(/≥/g, '\\ge ')
    .replace(/≠/g, '\\ne ')
    .replace(/≈/g, '\\approx ')
    .replace(/∞/g, '\\infty ')
    .replace(/°/g, '^\\circ ')
    .replace(/\\degree/g, '^\\circ ')
    .replace(/Δ/g, '\\Delta ')
    .replace(/Ω/g, '\\Omega ')
    .replace(/μ/g, '\\mu ')
    .replace(/λ/g, '\\lambda ')
    .replace(/π/g, '\\pi ')
    .replace(/θ/g, '\\theta ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/ρ/g, '\\rho ')
    .replace(/σ/g, '\\sigma ')
    .replace(/ω/g, '\\omega ')
    .replace(/ε/g, '\\varepsilon ')
    .replace(/φ/g, '\\varphi ');

  return f;
}

function convertChemStringToLatex(chem: string): string {
  let s = chem.trim();
  // Arrows first
  s = s
    .replace(/<=>|<-->/g, ' \\rightleftharpoons ')
    .replace(/->/g, ' \\rightarrow ')
    .replace(/<-/g, ' \\leftarrow ');

  // States of matter like (g), (l), (s), (aq)
  s = s.replace(/\((aq|s|l|g)\)/g, '\\text{($1)}');

  // Ion charges like ^2-, ^3+, ^+, ^-
  s = s.replace(/\^([0-9]+[+-]|[+-])/g, '^{$1}');

  // Subscript numbers after element letters or closing parenthesis: H2O -> \text{H}_2\text{O}
  s = s.replace(/([A-Za-z\)])([0-9]+)/g, '$1_{$2}');

  // Wrap element symbols in \mathrm
  s = s.replace(/\b([A-Z][a-z]?)\b/g, '\\mathrm{$1}');

  return s;
}

/**
 * Normalizes HTML <img> and Markdown ![alt](src) into unified [IMG:src] tokens
 * so they can be rendered cleanly alongside LaTeX and text.
 */
export function normalizeImageTokens(input: string): string {
  if (!input) return '';
  let out = input;

  // Convert <img ... src="..." ...> to [IMG:src]
  out = out.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi, (_m, src) => {
    return `[IMG:${src.trim()}]`;
  });

  // Convert Markdown ![alt](src) to [IMG:src]
  out = out.replace(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)]+|\/[^)]+)\)/gi, (_m, src) => {
    return `[IMG:${src.trim()}]`;
  });

  return out;
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
  const lines = mdText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
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
 * Parses an HTML <table> into structured rows/cells so each cell can render
 * LaTeX equations, chemical formulas, and embedded images safely.
 */
function parseHtmlTableToGrid(htmlTable: string): {
  beforeTable: string;
  headers: string[];
  rows: string[][];
  afterTable: string;
} | null {
  const tableMatch = htmlTable.match(/([\s\S]*?)<table[\s\S]*?>([\s\S]*?)<\/table>([\s\S]*)/i);
  if (!tableMatch) return null;

  const beforeTable = tableMatch[1].trim();
  const tableInner = tableMatch[2];
  const afterTable = tableMatch[3].trim();

  const trMatches = tableInner.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (trMatches.length === 0) return null;

  const cleanCellContent = (rawCell: string) => {
    const withImgs = normalizeImageTokens(rawCell);
    return withImgs
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<(?!\/?(?:sup|sub)\b)[^>]+>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .trim();
  };

  let headers: string[] = [];
  const rows: string[][] = [];

  trMatches.forEach((tr, rIdx) => {
    const thMatches = tr.match(/<th[\s\S]*?<\/th>/gi);
    if (rIdx === 0 && thMatches && thMatches.length > 0) {
      headers = thMatches.map(cleanCellContent);
    } else {
      const tdMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      if (tdMatches.length > 0) {
        rows.push(tdMatches.map(cleanCellContent));
      }
    }
  });

  return { beforeTable, headers, rows, afterTable };
}

/**
 * Renders a segment of text with:
 * - Images ([IMG:...], <img src="...">, ![alt](src))
 * - Display Math ($$...$$, \[...\], [RUMUS:...], [EQ:...])
 * - Inline Math ($...$, \(...\), \ce{...})
 * - HTML <sup>...</sup> and <sub>...</sub>
 */
const MathInlineSegment: React.FC<{
  text: string;
  inline?: boolean;
  onZoomImage?: (src: string) => void;
}> = ({ text, inline = false, onZoomImage }) => {
  const parts = useMemo(() => {
    const normalizedText = normalizeImageTokens(text);

    // Regex matches:
    // 1. Image token: [IMG:...]
    // 2. Display math: $$...$$ or \[...\] or [RUMUS:...] or [EQ:...]
    // 3. Inline math: $...$ or \(...\) or standalone \ce{...}
    // 4. HTML sub/sup tags: <sub>...</sub>, <sup>...</sup>
    const tokenRegex =
      /(\[IMG:[^\]]+\]|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\[(?:RUMUS|EQ):[\s\S]*?\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\)|\\ce\{[^{}]+\}|<sup>[\s\S]*?<\/sup>|<sub>[\s\S]*?<\/sub>)/gi;

    const splitParts = normalizedText.split(tokenRegex);

    return splitParts.map((segment, idx) => {
      if (!segment) return null;

      // 1. Embedded Image [IMG:...]
      if (segment.startsWith('[IMG:') && segment.endsWith(']')) {
        const imgSrc = segment.slice(5, -1).trim();
        if (!imgSrc) return null;
        return (
          <span
            key={idx}
            className={
              inline
                ? 'inline-flex items-center my-1 mr-2 align-middle'
                : 'block my-2.5'
            }
          >
            <img
              src={imgSrc}
              alt="Ilustrasi / Gambar Soal CBT"
              onClick={(e) => {
                if (onZoomImage) {
                  e.stopPropagation();
                  onZoomImage(imgSrc);
                }
              }}
              title="Klik untuk memperbesar gambar soal"
              className={`rounded-lg border border-slate-200 bg-white shadow-2xs object-contain transition-transform ${
                onZoomImage ? 'cursor-zoom-in hover:border-blue-400' : ''
              } ${
                inline
                  ? 'max-h-32 sm:max-h-40 max-w-[240px] sm:max-w-[300px] p-1'
                  : 'max-h-72 sm:max-h-80 max-w-full p-1.5'
              }`}
            />
          </span>
        );
      }

      // 2. Display math $$...$$ or \[...\] or [RUMUS:...] or [EQ:...]
      const isDisplayDollar =
        segment.startsWith('$$') && segment.endsWith('$$') && segment.length >= 4;
      const isDisplayBracket =
        segment.startsWith('\\[') && segment.endsWith('\\]') && segment.length >= 4;
      const isRumusTag =
        /^\[(?:RUMUS|EQ):/i.test(segment) && segment.endsWith(']');

      if (isDisplayDollar || isDisplayBracket || isRumusTag) {
        let rawFormula = '';
        if (isDisplayDollar || isDisplayBracket) {
          rawFormula = segment.slice(2, -2).trim();
        } else {
          rawFormula = segment.replace(/^\[(?:RUMUS|EQ):/i, '').slice(0, -1).trim();
        }
        const preparedFormula = normalizeFormulaForKatex(rawFormula);
        try {
          const renderedHtml = katex.renderToString(preparedFormula, {
            displayMode: !inline,
            throwOnError: false,
            strict: false,
          });
          return (
            <span
              key={idx}
              className={
                inline
                  ? 'inline-block px-1 align-middle'
                  : 'my-2.5 block text-center overflow-x-auto py-1.5 px-2 bg-slate-50/70 rounded-lg border border-slate-200/70'
              }
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        } catch {
          return (
            <span
              key={idx}
              className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-blue-800"
            >
              {rawFormula}
            </span>
          );
        }
      }

      // 3. Inline math $...$ or \(...\) or standalone \ce{...}
      const isInlineDollar =
        segment.startsWith('$') && segment.endsWith('$') && segment.length >= 2;
      const isInlineParen =
        segment.startsWith('\\(') && segment.endsWith('\\)') && segment.length >= 4;
      const isStandaloneCe = /^\\ce\{[^{}]+\}$/i.test(segment);

      if (isInlineDollar || isInlineParen || isStandaloneCe) {
        const rawFormula = isInlineDollar
          ? segment.slice(1, -1).trim()
          : isInlineParen
            ? segment.slice(2, -2).trim()
            : segment.trim();
        const preparedFormula = normalizeFormulaForKatex(rawFormula);
        try {
          const renderedHtml = katex.renderToString(preparedFormula, {
            displayMode: false,
            throwOnError: false,
            strict: false,
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
            <span
              key={idx}
              className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-800"
            >
              {rawFormula}
            </span>
          );
        }
      }

      // 4. HTML <sup> and <sub>
      if (
        segment.toLowerCase().startsWith('<sup>') &&
        segment.toLowerCase().endsWith('</sup>')
      ) {
        return (
          <sup key={idx} className="text-[75%] font-semibold text-slate-800">
            {segment.slice(5, -6)}
          </sup>
        );
      }
      if (
        segment.toLowerCase().startsWith('<sub>') &&
        segment.toLowerCase().endsWith('</sub>')
      ) {
        return (
          <sub key={idx} className="text-[75%] font-semibold text-slate-800">
            {segment.slice(5, -6)}
          </sub>
        );
      }

      return <span key={idx}>{segment}</span>;
    });
  }, [text, inline, onZoomImage]);

  return <>{parts}</>;
};

/**
 * Comprehensive Math, Physics, Chemistry, Image & Table Content Renderer
 */
export const MathAndTableRenderer: React.FC<MathAndTableRendererProps> = ({
  content,
  className = '',
  inline = false,
}) => {
  const [zoomedImageSrc, setZoomedImageSrc] = useState<string | null>(null);

  if (!content) return null;

  const zoomModal = zoomedImageSrc ? (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        e.stopPropagation();
        setZoomedImageSrc(null);
      }}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-3 shadow-2xl border border-slate-200 flex flex-col items-center"
      >
        <img
          src={zoomedImageSrc}
          alt="Pratinjau Gambar Soal Diperbesar"
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        <div className="mt-2.5 flex items-center justify-between w-full px-2 text-xs text-slate-600">
          <span>Gambar / Ilustrasi Butir Soal CBT</span>
          <button
            type="button"
            onClick={() => setZoomedImageSrc(null)}
            className="px-3 py-1 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // 1. If content contains HTML Table
  if (hasHtmlTable(content)) {
    const parsedHtmlTable = parseHtmlTableToGrid(content);
    if (parsedHtmlTable) {
      return (
        <div className={`space-y-2.5 ${className}`}>
          {parsedHtmlTable.beforeTable && (
            <div className="whitespace-pre-line">
              <MathInlineSegment
                text={parsedHtmlTable.beforeTable}
                onZoomImage={setZoomedImageSrc}
              />
            </div>
          )}
          <div className="overflow-x-auto my-2 rounded-lg border border-slate-300 shadow-2xs bg-white">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              {parsedHtmlTable.headers.length > 0 && (
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    {parsedHtmlTable.headers.map((h, i) => (
                      <th
                        key={i}
                        className="py-2.5 px-3.5 font-bold text-slate-800 border-r last:border-r-0 border-slate-300"
                      >
                        <MathInlineSegment
                          text={h}
                          onZoomImage={setZoomedImageSrc}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-slate-200">
                {parsedHtmlTable.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="py-2.5 px-3.5 text-slate-700 border-r last:border-r-0 border-slate-200"
                      >
                        <MathInlineSegment
                          text={cell}
                          onZoomImage={setZoomedImageSrc}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedHtmlTable.afterTable && (
            <div className="whitespace-pre-line">
              <MathInlineSegment
                text={parsedHtmlTable.afterTable}
                onZoomImage={setZoomedImageSrc}
              />
            </div>
          )}
          {zoomModal}
        </div>
      );
    }

    return (
      <div
        className={`overflow-x-auto my-2 rounded-lg border border-slate-300 bg-white ${className}`}
      >
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
        <div
          className={`overflow-x-auto my-3 rounded-lg border border-slate-300 shadow-xs bg-white ${className}`}
        >
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                {tableData.headers.map((h, i) => (
                  <th
                    key={i}
                    className="py-2.5 px-3.5 font-bold text-slate-800 border-r last:border-r-0 border-slate-300"
                  >
                    <MathInlineSegment text={h} onZoomImage={setZoomedImageSrc} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tableData.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="py-2.5 px-3.5 text-slate-700 border-r last:border-r-0 border-slate-200"
                    >
                      <MathInlineSegment
                        text={cell}
                        onZoomImage={setZoomedImageSrc}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {zoomModal}
        </div>
      );
    }
  }

  // 3. Standard Text with potential math, images, or paragraphs
  if (inline) {
    return (
      <span className={className}>
        <MathInlineSegment
          text={content}
          inline
          onZoomImage={setZoomedImageSrc}
        />
        {zoomModal}
      </span>
    );
  }

  // Multi-line paragraphs
  const paragraphs = content.split(/\n\s*\n/);
  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {paragraphs.map((p, idx) => (
        <div key={idx} className="whitespace-pre-line">
          <MathInlineSegment text={p} onZoomImage={setZoomedImageSrc} />
        </div>
      ))}
      {zoomModal}
    </div>
  );
};
