import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Calculator,
  Atom,
  FlaskConical,
  Plus,
  Trash2,
  Eye,
  FileText,
  Sparkles,
  Check,
} from 'lucide-react';
import { MathAndTableRenderer } from './MathAndTableRenderer';
import {
  convertImageFileToInlineToken,
  SAMPLE_PHYSICS_DIAGRAM_DATA_URL,
} from '../utils/cbtFileParsers';

export type QuestionTargetField =
  | 'teks_soal'
  | 'wacana'
  | 'opsi_a'
  | 'opsi_b'
  | 'opsi_c'
  | 'opsi_d'
  | 'opsi_e';

interface QuestionEquationAndImageHelperProps {
  wacana: string;
  teksSoal: string;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  onInsertToField: (field: QuestionTargetField, snippet: string) => void;
  onRemoveImagesFromField: (field: QuestionTargetField) => void;
}

interface FormulaPreset {
  label: string;
  latex: string;
  desc: string;
}

const MATH_PRESETS: FormulaPreset[] = [
  { label: 'Pecahan a/b', latex: '$\\frac{a}{b}$', desc: 'Pecahan biasa' },
  { label: 'Akar √x', latex: '$\\sqrt{x}$', desc: 'Akar kuadrat' },
  { label: 'Akar ⁿ√x', latex: '$\\sqrt[3]{x}$', desc: 'Akar pangkat n' },
  { label: 'Pangkat xⁿ', latex: '$x^{2}$', desc: 'Eksponen / pangkat' },
  { label: 'Indeks xₙ', latex: '$x_{1}$', desc: 'Subskrip / indeks' },
  {
    label: 'Rumus ABC Kuadrat',
    latex: '$x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$',
    desc: 'Akar persamaan kuadrat',
  },
  {
    label: 'Integral Tentu',
    latex: '$\\int_{a}^{b} f(x)\\,dx$',
    desc: 'Integral batas a ke b',
  },
  {
    label: 'Limit Fungsi',
    latex: '$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$',
    desc: 'Limit mendekati nilai',
  },
  {
    label: 'Turunan dy/dx',
    latex: '$\\frac{dy}{dx} = f\'(x)$',
    desc: 'Diferensial / turunan',
  },
  {
    label: 'Notasi Sigma Σ',
    latex: '$\\sum_{i=1}^{n} x_i$',
    desc: 'Penjumlahan beruntun',
  },
  {
    label: 'Logaritma',
    latex: '$^{a}\\log b = c$',
    desc: 'Logaritma basis a',
  },
  {
    label: 'Matriks 2×2',
    latex: '$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$',
    desc: 'Matriks baris & kolom',
  },
  {
    label: 'Trigonometri',
    latex: '$\\sin^2\\theta + \\cos^2\\theta = 1$',
    desc: 'Identitas trigonometri',
  },
  {
    label: 'Vektor Satuan',
    latex: '$\\vec{u} = a\\hat{i} + b\\hat{j} + c\\hat{k}$',
    desc: 'Vektor dimensi tiga',
  },
];

const PHYSICS_PRESETS: FormulaPreset[] = [
  {
    label: 'Hukum II Newton',
    latex: '$\\sum \\vec{F} = m \\cdot \\vec{a}$',
    desc: 'Resultan gaya & percepatan',
  },
  {
    label: 'Energi Kinetik',
    latex: '$E_k = \\frac{1}{2} m v^2$',
    desc: 'Energi gerak benda',
  },
  {
    label: 'Energi Potensial',
    latex: '$E_p = m \\cdot g \\cdot h$',
    desc: 'Energi ketinggian gravitasi',
  },
  {
    label: 'Relativitas Einstein',
    latex: '$E = m c^2$',
    desc: 'Kesetaraan massa-energi',
  },
  {
    label: 'Gaya Gravitasi Newton',
    latex: '$F = G \\frac{m_1 m_2}{r^2}$',
    desc: 'Tarik-menarik dua massa',
  },
  {
    label: 'Gaya Coulomb Listrik',
    latex: '$F = k \\frac{q_1 q_2}{r^2}$',
    desc: 'Interaksi muatan listrik',
  },
  {
    label: 'Hukum Ohm & Daya',
    latex: '$V = I \\cdot R \\quad (\\Omega)$',
    desc: 'Tegangan, arus & hambatan',
  },
  {
    label: 'Rangkaian Paralel',
    latex: '$\\frac{1}{R_p} = \\frac{1}{R_1} + \\frac{1}{R_2}$',
    desc: 'Hambatan pengganti paralel',
  },
  {
    label: 'Gelombang λ = v/f',
    latex: '$\\lambda = \\frac{v}{f}$',
    desc: 'Panjang gelombang & frekuensi',
  },
  {
    label: 'Termodinamika I',
    latex: '$\\Delta U = Q - W$',
    desc: 'Energi dalam, kalor & usaha',
  },
  {
    label: 'Tekanan Hidrostatis',
    latex: '$P_h = \\rho \\cdot g \\cdot h$',
    desc: 'Tekanan zat cair',
  },
  {
    label: 'Optik Lensa/Cermin',
    latex: '$\\frac{1}{f} = \\frac{1}{s} + \\frac{1}{s\'}$',
    desc: 'Jarak fokus & bayangan',
  },
  {
    label: 'Induksi Magnetik Kawat',
    latex: '$B = \\frac{\\mu_0 I}{2\\pi r}$',
    desc: 'Medan magnet sekitar arus',
  },
  {
    label: 'GLBB Kinematika',
    latex: '$v_t^2 = v_0^2 \\pm 2 a s$',
    desc: 'Gerak lurus berubah beraturan',
  },
];

const CHEMISTRY_PRESETS: FormulaPreset[] = [
  {
    label: 'Reaksi Pembentukan Air',
    latex: '$\\ce{2H2(g) + O2(g) -> 2H2O(l)}$',
    desc: 'Persamaan reaksi kimia',
  },
  {
    label: 'Kesetimbangan Haber-Bosch',
    latex: '$\\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$',
    desc: 'Reaksi bolak-balik (reversible)',
  },
  {
    label: 'Rumus Kimia H₂SO₄',
    latex: '$\\ce{H2SO4(aq)}$',
    desc: 'Asam sulfat encer',
  },
  {
    label: 'Ion Poliatomik SO₄²⁻',
    latex: '$\\ce{SO4^2-}$',
    desc: 'Anion bermuatan 2-',
  },
  {
    label: 'Reaksi Ionisasi Asam',
    latex: '$\\ce{CH3COOH(aq) <=> CH3COO^-(aq) + H^+(aq)}$',
    desc: 'Ionisasi asam lemah',
  },
  {
    label: 'Rumus pH Asam-Basa',
    latex: '$\\text{pH} = -\\log[\\text{H}^+]$',
    desc: 'Derajat keasaman larutan',
  },
  {
    label: 'Konsentrasi [H⁺] Asam Lemah',
    latex: '$[\\text{H}^+] = \\sqrt{K_a \\cdot M_a}$',
    desc: 'Molaritas ion hidrogen',
  },
  {
    label: 'Tetapan Kesetimbangan Kc',
    latex: '$K_c = \\frac{[\\text{C}]^c [\\text{D}]^d}{[\\text{A}]^a [\\text{B}]^b}$',
    desc: 'Hukum aksi massa',
  },
  {
    label: 'Persamaan Gas Ideal',
    latex: '$P \\cdot V = n \\cdot R \\cdot T$',
    desc: 'Tekanan, volume, mol & suhu',
  },
  {
    label: 'Perubahan Entalpi ΔH°',
    latex: '$\\Delta H^\\circ = \\sum \\Delta H^\\circ_f(\\text{produk}) - \\sum \\Delta H^\\circ_f(\\text{reaktan})$',
    desc: 'Termokimia reaksi',
  },
  {
    label: 'Notasi Unsur / Isotop',
    latex: '$_{6}^{12}\\text{C}$',
    desc: 'Nomor atom & nomor massa',
  },
  {
    label: 'Laju Reaksi Kimia',
    latex: '$v = k [\\text{A}]^m [\\text{B}]^n$',
    desc: 'Persamaan laju & orde reaksi',
  },
];

const FIELD_LABELS: { id: QuestionTargetField; label: string }[] = [
  { id: 'teks_soal', label: 'Pertanyaan / Teks Soal' },
  { id: 'wacana', label: 'Wacana / Stimulus' },
  { id: 'opsi_a', label: 'Opsi Jawaban A' },
  { id: 'opsi_b', label: 'Opsi Jawaban B' },
  { id: 'opsi_c', label: 'Opsi Jawaban C' },
  { id: 'opsi_d', label: 'Opsi Jawaban D' },
  { id: 'opsi_e', label: 'Opsi Jawaban E' },
];

export const QuestionEquationAndImageHelper: React.FC<
  QuestionEquationAndImageHelperProps
> = ({
  wacana,
  teksSoal,
  opsiA,
  opsiB,
  opsiC,
  opsiD,
  opsiE,
  onInsertToField,
  onRemoveImagesFromField,
}) => {
  const [targetField, setTargetField] = useState<QuestionTargetField>('teks_soal');
  const [showEquationBuilder, setShowEquationBuilder] = useState(false);
  const [activeSubjectTab, setActiveSubjectTab] = useState<
    'matematika' | 'fisika' | 'kimia'
  >('fisika');
  const [customFormulaInput, setCustomFormulaInput] = useState(
    '\\sum \\vec{F} = m \\cdot \\vec{a}'
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const triggerFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsUploadingImage(true);
    try {
      const token = await convertImageFileToInlineToken(file);
      onInsertToField(targetField, token);
      const targetName =
        FIELD_LABELS.find((f) => f.id === targetField)?.label || targetField;
      triggerFeedback(`Gambar berhasil disisipkan ke ${targetName}!`);
    } catch (err: any) {
      triggerFeedback(err.message || 'Gagal memproses gambar.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleInsertSamplePhysicsDiagram = () => {
    const token = `[IMG:${SAMPLE_PHYSICS_DIAGRAM_DATA_URL}]`;
    onInsertToField(targetField, token);
    const targetName =
      FIELD_LABELS.find((f) => f.id === targetField)?.label || targetField;
    triggerFeedback(`Contoh diagram Fisika disisipkan ke ${targetName}!`);
  };

  const handleInsertPreset = (latex: string, label: string) => {
    onInsertToField(targetField, latex);
    const targetName =
      FIELD_LABELS.find((f) => f.id === targetField)?.label || targetField;
    triggerFeedback(`Rumus "${label}" disisipkan ke ${targetName}!`);
  };

  const handleInsertCustomFormula = () => {
    const trimmed = customFormulaInput.trim();
    if (!trimmed) return;
    const wrapped =
      trimmed.startsWith('$') || trimmed.startsWith('\\ce{')
        ? trimmed
        : `$${trimmed}$`;
    onInsertToField(targetField, wrapped);
    const targetName =
      FIELD_LABELS.find((f) => f.id === targetField)?.label || targetField;
    triggerFeedback(`Rumus kustom berhasil disisipkan ke ${targetName}!`);
  };

  const activePresets =
    activeSubjectTab === 'matematika'
      ? MATH_PRESETS
      : activeSubjectTab === 'fisika'
        ? PHYSICS_PRESETS
        : CHEMISTRY_PRESETS;

  const hasAnyContent = Boolean(
    wacana.trim() ||
      teksSoal.trim() ||
      opsiA.trim() ||
      opsiB.trim() ||
      opsiC.trim() ||
      opsiD.trim() ||
      opsiE.trim()
  );

  const countImagesInField = (val: string) => {
    const matches = val.match(/\[IMG:[^\]]+\]/gi);
    return matches ? matches.length : 0;
  };

  const fieldValueMap: Record<QuestionTargetField, string> = {
    teks_soal: teksSoal,
    wacana,
    opsi_a: opsiA,
    opsi_b: opsiB,
    opsi_c: opsiC,
    opsi_d: opsiD,
    opsi_e: opsiE,
  };

  const currentFieldImageCount = countImagesInField(fieldValueMap[targetField] || '');

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/50 p-3.5 space-y-3 shadow-2xs">
      {/* Top Toolbar: Target Field Selector + Insert Image + Toggle Equation Panel */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-950">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>Alat Bantu Sisipkan Gambar &amp; Equation Rumus (Matematika · Fisika · Kimia)</span>
        </div>
        {feedbackMsg && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
            <Check className="w-3 h-3" />
            {feedbackMsg}
          </span>
        )}
      </div>

      {/* Target Field Selection + Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
        <div className="sm:col-span-5">
          <label
            htmlFor="helper-target-field"
            className="block text-[11px] font-bold text-slate-700 mb-1"
          >
            1. Pilih Kolom Tujuan Sisip:
          </label>
          <select
            id="helper-target-field"
            value={targetField}
            onChange={(e) => setTargetField(e.target.value as QuestionTargetField)}
            className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
          >
            {FIELD_LABELS.map((f) => {
              const imgCount = countImagesInField(fieldValueMap[f.id] || '');
              return (
                <option key={f.id} value={f.id}>
                  {f.label} {imgCount > 0 ? `(${imgCount} Gambar)` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="sm:col-span-7 flex flex-wrap items-end gap-1.5 pt-1 sm:pt-4">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
            onChange={handleImageFileSelect}
            className="hidden"
          />
          <button
            type="button"
            disabled={isUploadingImage}
            onClick={() => imageInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{isUploadingImage ? 'Memproses...' : '+ Upload Gambar'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEquationBuilder((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              showEquationBuilder
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-indigo-800 border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>
              {showEquationBuilder ? 'Tutup Panel Rumus' : '+ Equation / Rumus'}
            </span>
          </button>

          {currentFieldImageCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onRemoveImagesFromField(targetField);
                triggerFeedback('Gambar pada kolom terpilih dihapus.');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer"
              title="Hapus gambar yang disisipkan pada kolom ini"
            >
              <Trash2 className="w-3 h-3" />
              <span>Hapus Gambar ({currentFieldImageCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Equation & Formula Builder (Matematika, Fisika, Kimia) */}
      {showEquationBuilder && (
        <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-3">
          {/* Subject Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveSubjectTab('fisika');
                  setCustomFormulaInput('\\sum \\vec{F} = m \\cdot \\vec{a}');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                  activeSubjectTab === 'fisika'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Atom className="w-3.5 h-3.5" />
                <span>Fisika</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSubjectTab('matematika');
                  setCustomFormulaInput('x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                  activeSubjectTab === 'matematika'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Matematika</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSubjectTab('kimia');
                  setCustomFormulaInput('\\ce{N2(g) + 3H2(g) <=> 2NH3(g)}');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                  activeSubjectTab === 'kimia'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Kimia</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleInsertSamplePhysicsDiagram}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
            >
              + Sisipkan Contoh Diagram Gaya Fisika
            </button>
          </div>

          {/* Preset Equation Buttons Grid */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
              Klik rumus di bawah untuk langsung menyisipkan ke{' '}
              <strong className="text-indigo-800">
                {FIELD_LABELS.find((f) => f.id === targetField)?.label}
              </strong>
              :
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {activePresets.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleInsertPreset(item.latex, item.label)}
                  className="p-2 rounded-lg border border-slate-200 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/50 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-700 truncate">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-900 overflow-x-auto">
                    <MathAndTableRenderer content={item.latex} inline />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Equation Builder with Real-Time Preview */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="custom-equation-input"
                className="text-[11px] font-bold text-slate-700"
              >
                Ketik / Edit Equation Kustom (LaTeX atau Kimia \ce{'{...}'}):
              </label>
              <span className="text-[10px] text-slate-500">
                Otomatis dibungkus <code>$...$</code>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="custom-equation-input"
                type="text"
                value={customFormulaInput}
                onChange={(e) => setCustomFormulaInput(e.target.value)}
                placeholder="Contoh: \frac{1}{2}mv^2 atau \ce{2H2 + O2 -> 2H2O}"
                className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={handleInsertCustomFormula}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Sisipkan</span>
              </button>
            </div>
            {customFormulaInput.trim() && (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-[11px] text-slate-500 font-medium">
                  Pratinjau Rumus:
                </span>
                <div className="font-semibold text-slate-900 overflow-x-auto">
                  <MathAndTableRenderer
                    content={
                      customFormulaInput.trim().startsWith('$')
                        ? customFormulaInput.trim()
                        : `$${customFormulaInput.trim()}$`
                    }
                    inline
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Question Preview (Shows Rendered Images & Equations before saving) */}
      {hasAnyContent && (
        <div className="pt-1 border-t border-indigo-200/60">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLivePreview((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-800 hover:text-indigo-950 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {showLivePreview
                  ? 'Sembunyikan Pratinjau Visual Soal (Gambar & Rumus)'
                  : 'Lihat Pratinjau Visual Soal (Gambar & Rumus)'}
              </span>
            </button>
            <span className="text-[10px] text-slate-500">
              Tampilan persis seperti di layar ujian siswa
            </span>
          </div>

          {showLivePreview && (
            <div className="mt-2 p-3 rounded-xl bg-white border border-slate-200 space-y-2 text-xs">
              {wacana.trim() && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-blue-600" />
                    <span>Pratinjau Wacana / Stimulus:</span>
                  </div>
                  <MathAndTableRenderer content={wacana} />
                </div>
              )}
              {teksSoal.trim() && (
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Pratinjau Pertanyaan:
                  </div>
                  <div className="font-semibold text-slate-900">
                    <MathAndTableRenderer content={teksSoal} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {(
                  [
                    ['A', opsiA],
                    ['B', opsiB],
                    ['C', opsiC],
                    ['D', opsiD],
                    ['E', opsiE],
                  ] as const
                ).map(([letter, val]) =>
                  val.trim() ? (
                    <div
                      key={letter}
                      className="p-2 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start gap-2"
                    >
                      <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {letter}
                      </span>
                      <div className="flex-1 min-w-0 overflow-x-auto">
                        <MathAndTableRenderer content={val} inline />
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
