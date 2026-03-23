import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createKeyword, updateKeyword, deleteKeyword } from '../lib/api';
import { toast } from 'sonner';
import { Plus, Trash2, Tag, Search, X } from 'lucide-react';

interface Keyword {
  id: string;
  keyword: string;
  category: string;
  countries: string[];
  active: boolean;
}

const countryFlags: Record<string, string> = { FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹' };

export function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [form, setForm] = useState({ keyword: '', category: '', countries: '' });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchKeywords = () => {
    supabase.from('keywords').select('*').order('category').order('keyword')
      .then(({ data }) => setKeywords(data || []));
  };

  useEffect(() => { fetchKeywords(); }, []);

  const handleAdd = async () => {
    if (!form.keyword || !form.category || !form.countries) {
      toast.error('All fields are required');
      return;
    }
    setSaving(true);
    try {
      await createKeyword({
        keyword: form.keyword.trim(),
        category: form.category.trim(),
        countries: form.countries.split(',').map((c) => c.trim().toUpperCase()),
      });
      setForm({ keyword: '', category: '', countries: '' });
      setShowForm(false);
      fetchKeywords();
      toast.success('Keyword added');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (kw: Keyword) => {
    await updateKeyword(kw.id, { active: !kw.active });
    fetchKeywords();
    toast.success(`${kw.keyword} ${kw.active ? 'deactivated' : 'activated'}`);
  };

  const handleDelete = async (kw: Keyword) => {
    if (deleteConfirm !== kw.id) {
      setDeleteConfirm(kw.id);
      return;
    }
    await deleteKeyword(kw.id);
    setDeleteConfirm(null);
    fetchKeywords();
    toast.success(`"${kw.keyword}" deleted`);
  };

  const filtered = keywords.filter((kw) =>
    !searchQuery || kw.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
    kw.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeCount = keywords.filter((kw) => kw.active).length;
  const categories = [...new Set(keywords.map((kw) => kw.category))];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Keywords</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {keywords.length} keywords tracked — {activeCount} active across {categories.length} categories
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'Add keyword'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-zinc-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">New keyword</h2>
          <div className="grid grid-cols-4 gap-3">
            <input
              placeholder="Keyword (e.g. men's polo)"
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 hover:border-zinc-300 transition-colors col-span-1"
            />
            <input
              placeholder="Category (e.g. Polos)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 hover:border-zinc-300 transition-colors"
            />
            <input
              placeholder="Countries (e.g. US,FR)"
              value={form.countries}
              onChange={(e) => setForm({ ...form, countries: e.target.value })}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 hover:border-zinc-300 transition-colors"
            />
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          placeholder="Search keywords..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 hover:border-zinc-300 transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50">
              <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Keyword</th>
              <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Category</th>
              <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Markets</th>
              <th className="text-center p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-24">Status</th>
              <th className="text-right p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map((kw) => (
              <tr key={kw.id} className={`transition-colors hover:bg-zinc-50 ${!kw.active ? 'opacity-50' : ''}`}>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-zinc-400 shrink-0" />
                    <span className="font-medium text-zinc-900">{kw.keyword}</span>
                  </div>
                </td>
                <td className="p-3">
                  <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{kw.category}</span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    {kw.countries.map((c) => (
                      <span key={c} className="text-xs bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-full" title={c}>
                        {countryFlags[c] || c} {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => handleToggleActive(kw)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      kw.active ? 'bg-brand' : 'bg-zinc-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm ${
                        kw.active ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleDelete(kw)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                      deleteConfirm === kw.id
                        ? 'bg-red-50 text-red-600 font-medium'
                        : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 size={12} />
                    {deleteConfirm === kw.id ? 'Confirm?' : ''}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-zinc-400 text-sm">
            {searchQuery ? 'No keywords match your search.' : 'No keywords yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
