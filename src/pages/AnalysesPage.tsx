import { useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { Target, TrendingUp, ChevronDown, ChevronRight, BarChart3, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, Crosshair, BookOpen, LayoutList, Type, Code2, Lightbulb, Search, GitCompare } from 'lucide-react';

interface Analysis {
  id: string;
  analysis_type: string;
  actor: string | null;
  content: string;
  tags: string[];
  lacoste_position: number | null;
  position_before: number | null;
  position_after: number | null;
  variation: number | null;
  movement_type: string | null;
  search_intent: string | null;
  sources: SourceRef[] | null;
  opportunity_score: number | null;
  country: string;
  device: string;
  keywords: { keyword: string };
  runs: { run_label: string };
}

interface SourceRef {
  position: number | 'lacoste_ref';
  domain: string;
  actor_name: string;
  url: string;
  match_method?: 'token' | 'llm';
}

const countryFlags: Record<string, string> = { FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹' };

// Section config for structured analysis rendering
const sectionConfig: Record<string, { icon: typeof Crosshair; label: string; color: string; bg: string }> = {
  'Alignement intention': { icon: Crosshair, label: 'Alignement intention', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  'Couverture sémantique': { icon: BookOpen, label: 'Couverture sémantique', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
  'Structure': { icon: LayoutList, label: 'Structure', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  'Optimisation meta': { icon: Type, label: 'Optimisation meta', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  'Données structurées': { icon: Code2, label: 'Données structurées', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
  'Analyse des titles': { icon: Type, label: 'Analyse des titles', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  'Profondeur de contenu': { icon: BookOpen, label: 'Profondeur de contenu', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
  'Points clés': { icon: Lightbulb, label: 'Points clés', color: 'text-brand', bg: 'bg-brand/5 border-brand/20' },
};

interface ParsedSection {
  title: string;
  content: string;
}

/**
 * Normalize section content: handle JSON objects from small LLMs (Ollama/ministral)
 * and ensure proper line breaks for readability.
 */
function normalizeContent(raw: string): string {
  const trimmed = raw.trim();

  // Detect JSON array or object content (Ollama often returns objects instead of strings)
  if (/^\[?\{/.test(trimmed) && /\}]?$/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      return jsonToMarkdown(parsed);
    } catch {
      // Not valid JSON, continue with text normalization
    }
  }

  // Text normalization: add line breaks before "Pos#N" or "Pos #N" patterns
  // so each position entry appears on its own line
  let text = trimmed
    .replace(/(?<!\n)\s*(Pos[#\s]?\d+)/g, '\n$1')
    .replace(/(?<!\n)\s*(Lacoste\s*:)/g, '\n$1')
    .replace(/^\n/, ''); // remove leading newline if added

  return text;
}

/** Convert JSON objects/arrays from LLM into readable markdown */
function jsonToMarkdown(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map((item) => jsonToMarkdown(item)).join('\n\n');
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Handle common Ollama patterns: {concurrents: [...], lacoste: {...}}
    const lines: string[] = [];

    // Process "concurrents" array if present
    if (Array.isArray(obj.concurrents)) {
      for (const c of obj.concurrents) {
        if (typeof c === 'object' && c !== null) {
          const cc = c as Record<string, unknown>;
          const site = cc.site || cc.domain || cc.actor_name || '';
          const parts: string[] = [];
          if (site) parts.push(`**${site}**`);
          // Collect all text-like fields
          for (const [key, val] of Object.entries(cc)) {
            if (['site', 'domain', 'actor_name'].includes(key)) continue;
            if (typeof val === 'string' && val.length > 0) {
              parts.push(`${val}`);
            } else if (typeof val === 'number') {
              parts.push(`${key}: ${val}`);
            }
          }
          lines.push(`- ${parts.join(' — ')}`);
        }
      }
    }

    // Process "lacoste" object if present
    if (obj.lacoste && typeof obj.lacoste === 'object') {
      const lac = obj.lacoste as Record<string, unknown>;
      const parts: string[] = ['**Lacoste**'];
      for (const [key, val] of Object.entries(lac)) {
        if (typeof val === 'string' && val.length > 0) {
          parts.push(`${val}`);
        } else if (typeof val === 'number') {
          parts.push(`${key}: ${val}`);
        }
      }
      lines.push(`- ${parts.join(' — ')}`);
    }

    // If no known pattern, format all key-value pairs
    if (lines.length === 0) {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          lines.push(`**${key}** : ${val}`);
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          lines.push(`**${key}** : ${val}`);
        } else if (Array.isArray(val)) {
          lines.push(`**${key}** :`);
          for (const item of val) {
            lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
          }
        } else if (typeof val === 'object' && val !== null) {
          lines.push(`**${key}** : ${jsonToMarkdown(val)}`);
        }
      }
    }

    return lines.join('\n');
  }
  return String(data);
}

function parseAnalysisContent(content: string): { sections: ParsedSection[]; recommendations: string[] } {
  const sections: ParsedSection[] = [];
  const recommendations: string[] = [];

  // Split on ### or ## headers
  const parts = content.split(/^#{2,3}\s+/m).filter(Boolean);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (title === 'Recommandations' || title === 'Points clés') {
      const recos = body.split('\n').filter(l => l.trim());
      for (const r of recos) {
        recommendations.push(r.replace(/^\d+\.\s*/, '').trim());
      }
    } else if (body) {
      sections.push({ title, content: normalizeContent(body) });
    }
  }

  return { sections, recommendations };
}

function findSectionConfig(title: string) {
  // Exact match first, then prefix match (handles "Alignement intention & type de page" → "Alignement intention")
  if (sectionConfig[title]) return sectionConfig[title];
  for (const [key, cfg] of Object.entries(sectionConfig)) {
    if (title.startsWith(key)) return cfg;
  }
  return undefined;
}

/** Replace known actor names in text with clickable links */
export function CitationText({ text, sources }: { text: string; sources: SourceRef[] | null }) {
  if (!sources || sources.length === 0) {
    return <>{text}</>;
  }

  // Build lookup: actor_name → url, domain → url
  const lookup = new Map<string, string>();
  for (const s of sources) {
    if (s.actor_name) lookup.set(s.actor_name.toLowerCase(), s.url);
    if (s.domain) lookup.set(s.domain.toLowerCase(), s.url);
  }

  // Sort keys by length desc so longer names match first
  const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
  if (keys.length === 0) return <>{text}</>;

  // Build regex matching whole words only
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const parts: Array<string | { text: string; url: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const matchIndex = match.index!;
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }
    const url = lookup.get(match[0].toLowerCase());
    if (url) {
      parts.push({ text: match[0], url });
    } else {
      parts.push(match[0]);
    }
    lastIndex = matchIndex + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline decoration-brand/30 hover:decoration-brand/60 transition-colors"
          >
            {part.text}
          </a>
        ),
      )}
    </>
  );
}

function CollapsibleSection({ section, sources: _sources }: { section: ParsedSection; sources: SourceRef[] | null }) {
  const [open, setOpen] = useState(false);
  const config = findSectionConfig(section.title);
  const Icon = config?.icon || BookOpen;
  const colorClass = config?.color || 'text-zinc-600';
  const borderClass = config ? config.bg.split(' ')[1] : 'border-zinc-200'; // e.g. "border-blue-200"
  const bgClass = config ? config.bg.split(' ')[0] : 'bg-zinc-50';         // e.g. "bg-blue-50"

  return (
    <div className={`rounded-lg border ${borderClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:brightness-95 ${bgClass}`}
      >
        {open ? (
          <ChevronDown size={14} className={colorClass} />
        ) : (
          <ChevronRight size={14} className={colorClass} />
        )}
        <Icon size={14} className={colorClass} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${colorClass}`}>
          {config?.label || section.title}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2.5 border-t border-inherit bg-white prose prose-sm max-w-none text-zinc-700">
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function StructuredAnalysis({ content, sources }: { content: string; sources: SourceRef[] | null }) {
  const { sections, recommendations } = parseAnalysisContent(content);
  const [recosOpen, setRecosOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Fallback: if parsing yields nothing meaningful, show raw content
  if (sections.length === 0 && recommendations.length === 0) {
    return (
      <div className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <CollapsibleSection key={section.title} section={section} sources={sources} />
      ))}

      {recommendations.length > 0 && (
        <div className="rounded-lg border border-brand/20 overflow-hidden">
          <button
            onClick={() => setRecosOpen(!recosOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-brand/5 transition-colors hover:bg-brand/10"
          >
            {recosOpen ? (
              <ChevronDown size={14} className="text-brand" />
            ) : (
              <ChevronRight size={14} className="text-brand" />
            )}
            <Lightbulb size={14} className="text-brand" />
            <span className="text-xs font-semibold uppercase tracking-wide text-brand">
              Recommandations
            </span>
          </button>
          {recosOpen && (
            <div className="px-3 py-2.5 border-t border-brand/10 bg-white">
              <ol className="space-y-1.5">
                {recommendations.map((reco, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-brand/10 text-brand text-xs font-bold flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed prose prose-sm max-w-none text-zinc-700"><ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{reco}</ReactMarkdown></span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
      {sources && sources.length > 0 && (
        <div className="rounded-lg border border-zinc-200 overflow-hidden">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-zinc-50 transition-colors hover:bg-zinc-100"
          >
            {sourcesOpen ? (
              <ChevronDown size={14} className="text-zinc-400" />
            ) : (
              <ChevronRight size={14} className="text-zinc-400" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Sources ({sources.length})
            </span>
          </button>
          {sourcesOpen && (
            <div className="px-3 py-2.5 border-t border-zinc-100 bg-white">
              <ul className="space-y-1">
                {sources.map((s, idx) => {
                  let pathname = '';
                  try { pathname = new URL(s.url).pathname; } catch {}
                  return (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 text-xs text-zinc-400 w-6 text-right">
                        {s.position === 'lacoste_ref' ? 'ref' : `#${s.position}`}
                      </span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline truncate"
                      >
                        {s.actor_name || s.domain}
                      </a>
                      <span className="text-xs text-zinc-400 truncate hidden md:inline">
                        {pathname}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MovementBadge({ analysis }: { analysis: Analysis }) {
  if (analysis.analysis_type !== 'position_movement') return null;

  const v = analysis.variation ?? 0;
  if (analysis.position_before === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">
        <ArrowUpRight size={12} /> New entry #{analysis.position_after}
      </span>
    );
  }
  if (v > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
        <ArrowDownRight size={12} /> -{v} pos
      </span>
    );
  }
  if (v < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
        <ArrowUpRight size={12} /> +{Math.abs(v)} pos
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">
      <Minus size={12} /> Stable
    </span>
  );
}

export function AnalysesPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; run_label: string }>>([]);
  const [filters, setFilters] = useState({ run_id: '', type: '', keyword_id: '' });
  const [keywords, setKeywords] = useState<Array<{ id: string; keyword: string }>>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareRunId, setCompareRunId] = useState('');
  const [compareAnalyses, setCompareAnalyses] = useState<Analysis[]>([]);

  useEffect(() => {
    supabase.from('runs').select('id, run_label').order('started_at', { ascending: false })
      .then(({ data }) => setRuns(data || []));
  }, []);

  useEffect(() => {
    if (!filters.run_id) return;
    supabase
      .from('analyses')
      .select('keyword_id, keywords!inner(keyword)')
      .eq('run_id', filters.run_id)
      .then(({ data }) => {
        const unique = new Map<string, string>();
        for (const a of data || []) {
          unique.set(a.keyword_id, (a as any).keywords.keyword);
        }
        setKeywords([...unique.entries()].map(([id, keyword]) => ({ id, keyword })));
      });
  }, [filters.run_id]);

  useEffect(() => {
    if (!filters.run_id) return;
    let query = supabase
      .from('analyses')
      .select('*, keywords!inner(keyword), runs!inner(run_label)')
      .eq('run_id', filters.run_id)
      .order('created_at');

    if (filters.type) query = query.eq('analysis_type', filters.type);
    if (filters.keyword_id) query = query.eq('keyword_id', filters.keyword_id);

    query.then(({ data }) => setAnalyses(data || []));
  }, [filters]);

  // Fetch compare run analyses
  useEffect(() => {
    if (!compareMode || !compareRunId) { setCompareAnalyses([]); return; }
    let query = supabase
      .from('analyses')
      .select('*, keywords!inner(keyword), runs!inner(run_label)')
      .eq('run_id', compareRunId)
      .order('created_at');

    if (filters.type) query = query.eq('analysis_type', filters.type);
    if (filters.keyword_id) query = query.eq('keyword_id', filters.keyword_id);

    query.then(({ data }) => setCompareAnalyses(data || []));
  }, [compareMode, compareRunId, filters.type, filters.keyword_id]);

  const gapCount = analyses.filter((a) => a.analysis_type === 'lacoste_gap').length;
  const movementCount = analyses.filter((a) => a.analysis_type === 'position_movement').length;
  const deepDiveCount = analyses.filter((a) => a.analysis_type === 'top3_deep_dive').length;

  // Labels for compare mode
  const runALabel = runs.find(r => r.id === filters.run_id)?.run_label || 'Run A';
  // Group analyses by keyword — merging both runs in compare mode
  const groupedByKeyword = useMemo(() => {
    const allAnalyses = compareMode && compareRunId
      ? [...analyses, ...compareAnalyses]
      : analyses;
    const groups = new Map<string, { keyword: string; analyses: Analysis[] }>();
    for (const a of allAnalyses) {
      const kw = (a as any).keywords.keyword;
      if (!groups.has(kw)) groups.set(kw, { keyword: kw, analyses: [] });
      groups.get(kw)!.analyses.push(a);
    }
    // Sort analyses within each group: by type, then by run, then by country/device
    const typeOrder: Record<string, number> = { lacoste_gap: 0, top3_deep_dive: 1, position_movement: 2 };
    for (const group of groups.values()) {
      group.analyses.sort((a, b) => {
        const ta = typeOrder[a.analysis_type] ?? 3;
        const tb = typeOrder[b.analysis_type] ?? 3;
        if (ta !== tb) return ta - tb;
        // In compare mode, group same type together, run A first
        if (compareMode) {
          const ra = (a as any).runs.run_label === runALabel ? 0 : 1;
          const rb = (b as any).runs.run_label === runALabel ? 0 : 1;
          if (ra !== rb) return ra - rb;
        }
        return `${a.country}-${a.device}`.localeCompare(`${b.country}-${b.device}`);
      });
    }
    return [...groups.values()];
  }, [analyses, compareAnalyses, compareMode, compareRunId, runALabel]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Auto-expand all keyword groups when analyses change
  useEffect(() => {
    setExpandedGroups(new Set(groupedByKeyword.map(g => g.keyword)));
  }, [groupedByKeyword]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Analyses</h1>
        <p className="text-sm text-zinc-500 mt-1">LLM-generated competitive insights and ranking movements</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 p-3 sm:p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* Run selector + compare toggle */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <select
                value={filters.run_id}
                onChange={(e) => setFilters({ ...filters, run_id: e.target.value })}
                className={`appearance-none w-full sm:w-auto bg-zinc-50 border rounded-lg px-3 py-2 pr-8 text-sm font-medium text-zinc-700 hover:border-zinc-300 transition-colors ${compareMode ? 'border-blue-300' : 'border-zinc-200'}`}
              >
                <option value="">Select a run</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.run_label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              {compareMode && <span className="absolute -top-2 -left-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded-full">A</span>}
            </div>
            <button
              onClick={() => { setCompareMode(!compareMode); if (compareMode) { setCompareRunId(''); setCompareAnalyses([]); } }}
              className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                compareMode ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-zinc-100 text-zinc-500 border border-zinc-200 hover:text-zinc-700'
              }`}
            >
              <GitCompare size={13} /> {compareMode ? 'On' : 'Compare'}
            </button>
            {compareMode && (
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={compareRunId}
                  onChange={(e) => setCompareRunId(e.target.value)}
                  className="appearance-none w-full sm:w-auto bg-zinc-50 border border-violet-300 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-zinc-700 hover:border-violet-400 transition-colors"
                >
                  <option value="">Run B...</option>
                  {runs.filter(r => r.id !== filters.run_id).map((r) => (
                    <option key={r.id} value={r.id}>{r.run_label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <span className="absolute -top-2 -left-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 rounded-full">B</span>
              </div>
            )}
          </div>

          {/* Type filter — scrollable on mobile */}
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-1 overflow-x-auto">
            <button
              onClick={() => setFilters({ ...filters, type: '' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                !filters.type ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <BarChart3 size={12} /> All
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'lacoste_gap' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                filters.type === 'lacoste_gap' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Target size={12} /> Gaps ({gapCount})
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'position_movement' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                filters.type === 'position_movement' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <TrendingUp size={12} /> Mvt ({movementCount})
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'top3_deep_dive' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                filters.type === 'top3_deep_dive' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Crosshair size={12} /> Deep ({deepDiveCount})
            </button>
          </div>

          {/* Second row on mobile: keyword + device */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Keyword filter */}
            <div className="relative flex-1 sm:flex-initial">
              <select
                value={filters.keyword_id}
                onChange={(e) => setFilters({ ...filters, keyword_id: e.target.value })}
                className="appearance-none w-full sm:w-auto bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-zinc-700 hover:border-zinc-300 transition-colors"
              >
                <option value="">All keywords</option>
                {keywords.map((kw) => (
                  <option key={kw.id} value={kw.id}>{kw.keyword}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {!filters.run_id ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <BarChart3 size={32} className="mx-auto text-zinc-300 mb-3" />
          <p className="text-zinc-400 text-sm">Select a run to view analyses.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByKeyword.map((group) => {
            const isGroupOpen = expandedGroups.has(group.keyword);
            const groupGaps = group.analyses.filter(a => a.analysis_type === 'lacoste_gap');
            const bestOpp = Math.max(...groupGaps.map(a => a.opportunity_score ?? 0), 0);
            const lacPos = groupGaps[0]?.lacoste_position;

            return (
              <div key={group.keyword} className="rounded-xl border border-zinc-200 overflow-hidden">
                {/* Keyword group header */}
                <button
                  onClick={() => {
                    const next = new Set(expandedGroups);
                    if (next.has(group.keyword)) next.delete(group.keyword);
                    else next.add(group.keyword);
                    setExpandedGroups(next);
                  }}
                  className="w-full text-left px-3 sm:px-5 py-3 sm:py-3.5 flex items-center gap-2 sm:gap-3 bg-zinc-50 hover:bg-zinc-100 transition-colors"
                >
                  {isGroupOpen ? (
                    <ChevronDown size={16} className="text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-zinc-500 shrink-0" />
                  )}
                  <Search size={16} className="text-brand shrink-0 hidden sm:block" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="font-bold text-sm sm:text-base text-zinc-900 truncate">{group.keyword}</span>
                      <span className="text-xs text-zinc-400">
                        {group.analyses.length} analyse{group.analyses.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {lacPos ? (
                      <span className="text-xs bg-brand-light text-brand px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                        #{lacPos}
                      </span>
                    ) : groupGaps.length > 0 ? (
                      <span className="text-xs bg-red-50 text-red-600 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                        Absente
                      </span>
                    ) : null}
                    {bestOpp > 0 && (
                      <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium ${
                        bestOpp >= 7 ? 'bg-emerald-50 text-emerald-700' :
                        bestOpp >= 4 ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-600'
                      }`}>
                        {bestOpp}/10
                      </span>
                    )}
                  </div>
                </button>

                {/* Analyses within this keyword */}
                {isGroupOpen && (
                  <div className="divide-y divide-zinc-100">
                    {group.analyses.map((a) => {
                      const isGap = a.analysis_type === 'lacoste_gap';
                      const isDeepDive = a.analysis_type === 'top3_deep_dive';
                      const isExpanded = expanded === a.id;

                      return (
                        <div
                          key={a.id}
                          className={`bg-white transition-all ${
                            isGap ? 'border-l-4 border-l-brand' :
                            isDeepDive ? 'border-l-4 border-l-violet-500' :
                            'border-l-4 border-l-amber-400'
                          }`}
                        >
                          <button
                            onClick={() => setExpanded(isExpanded ? null : a.id)}
                            className="w-full text-left px-3 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 hover:bg-zinc-50/50 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown size={14} className="text-zinc-400 shrink-0" />
                            ) : (
                              <ChevronRight size={14} className="text-zinc-400 shrink-0" />
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                {compareMode && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    (a as any).runs.run_label === runALabel
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-violet-100 text-violet-700'
                                  }`}>
                                    {(a as any).runs.run_label === runALabel ? 'A' : 'B'}
                                  </span>
                                )}
                                <span className="font-medium text-sm text-zinc-700">
                                  {isGap ? 'Gap Analysis' : isDeepDive ? 'Deep Dive Top 3' : 'Movement'}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                                  {countryFlags[a.country] || a.country} {a.device}
                                </span>
                                {!isGap && a.actor && (
                                  <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                                    {a.actor}
                                  </span>
                                )}
                                <MovementBadge analysis={a} />
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Tags: hidden on mobile, shown on sm+ */}
                              <div className="hidden sm:flex items-center gap-1">
                                {a.tags?.map((tag) => (
                                  <span key={tag} className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              {isGap ? (
                                <Target size={14} className="text-brand ml-1" />
                              ) : isDeepDive ? (
                                <Crosshair size={14} className="text-violet-500 ml-1" />
                              ) : (
                                <TrendingUp size={14} className="text-amber-500 ml-1" />
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="border-t border-zinc-100 p-3 sm:p-5 bg-zinc-50/30">
                              <StructuredAnalysis content={a.content} sources={a.sources} />
                              {a.search_intent && (
                                <div className="mt-3 pt-3 border-t border-zinc-100">
                                  <span className="text-xs text-zinc-500 font-medium">Search intent: </span>
                                  <span className="text-xs text-zinc-700">{a.search_intent}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {analyses.length === 0 && (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <AlertTriangle size={24} className="mx-auto text-zinc-300 mb-2" />
              <p className="text-zinc-400 text-sm">No analyses found for this run.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
