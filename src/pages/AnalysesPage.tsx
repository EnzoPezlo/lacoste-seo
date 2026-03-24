import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { Target, TrendingUp, ChevronDown, ChevronRight, BarChart3, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, Crosshair, BookOpen, LayoutList, Type, Code2, Lightbulb } from 'lucide-react';

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
};

interface ParsedSection {
  title: string;
  content: string;
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

    if (title === 'Recommandations') {
      const recos = body.split('\n').filter(l => l.trim());
      for (const r of recos) {
        recommendations.push(r.replace(/^\d+\.\s*/, '').trim());
      }
    } else if (body) {
      sections.push({ title, content: body });
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
  const [filters, setFilters] = useState({ run_id: '', type: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('runs').select('id, run_label').order('started_at', { ascending: false })
      .then(({ data }) => setRuns(data || []));
  }, []);

  useEffect(() => {
    if (!filters.run_id) return;
    let query = supabase
      .from('analyses')
      .select('*, keywords!inner(keyword), runs!inner(run_label)')
      .eq('run_id', filters.run_id)
      .order('created_at');

    if (filters.type) query = query.eq('analysis_type', filters.type);

    query.then(({ data }) => setAnalyses(data || []));
  }, [filters]);

  const gapCount = analyses.filter((a) => a.analysis_type === 'lacoste_gap').length;
  const movementCount = analyses.filter((a) => a.analysis_type === 'position_movement').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Analyses</h1>
        <p className="text-sm text-zinc-500 mt-1">LLM-generated competitive insights and ranking movements</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filters.run_id}
              onChange={(e) => setFilters({ ...filters, run_id: e.target.value })}
              className="appearance-none bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-zinc-700 hover:border-zinc-300 transition-colors"
            >
              <option value="">Select a run</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>{r.run_label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-1">
            <button
              onClick={() => setFilters({ ...filters, type: '' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !filters.type ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <BarChart3 size={12} /> All
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'lacoste_gap' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filters.type === 'lacoste_gap' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Target size={12} /> Gaps ({gapCount})
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'position_movement' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filters.type === 'position_movement' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <TrendingUp size={12} /> Movements ({movementCount})
            </button>
          </div>
        </div>
      </div>

      {!filters.run_id ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <BarChart3 size={32} className="mx-auto text-zinc-300 mb-3" />
          <p className="text-zinc-400 text-sm">Select a run to view analyses.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => {
            const isGap = a.analysis_type === 'lacoste_gap';
            const isExpanded = expanded === a.id;

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border overflow-hidden transition-all ${
                  isGap ? 'border-l-4 border-l-brand border-zinc-200' : 'border-l-4 border-l-amber-400 border-zinc-200'
                }`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                  className="w-full text-left p-4 flex items-center gap-3 hover:bg-zinc-50/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-zinc-400 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-zinc-900">
                        {(a as any).keywords.keyword}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-medium">
                        {countryFlags[a.country] || a.country} {a.device}
                      </span>
                      {isGap && (
                        a.lacoste_position ? (
                          <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full font-medium">
                            Lacoste #{a.lacoste_position}
                          </span>
                        ) : (
                          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                            Lacoste absente
                          </span>
                        )
                      )}
                      {!isGap && a.actor && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          {a.actor}
                        </span>
                      )}
                      <MovementBadge analysis={a} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.tags?.map((tag) => (
                      <span key={tag} className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                    {isGap ? (
                      <Target size={14} className="text-brand ml-1" />
                    ) : (
                      <TrendingUp size={14} className="text-amber-500 ml-1" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-100 p-5 bg-zinc-50/30">
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
