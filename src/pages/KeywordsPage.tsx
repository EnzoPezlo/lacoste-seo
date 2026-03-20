import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createKeyword, updateKeyword, deleteKeyword } from '../lib/api';

interface Keyword {
  id: string;
  keyword: string;
  category: string;
  countries: string[];
  active: boolean;
}

export function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [form, setForm] = useState({ keyword: '', category: '', countries: '' });
  const [saving, setSaving] = useState(false);

  const fetchKeywords = () => {
    supabase.from('keywords').select('*').order('created_at')
      .then(({ data }) => setKeywords(data || []));
  };

  useEffect(() => { fetchKeywords(); }, []);

  const handleAdd = async () => {
    if (!form.keyword || !form.category || !form.countries) return;
    setSaving(true);
    try {
      await createKeyword({
        keyword: form.keyword.trim(),
        category: form.category.trim(),
        countries: form.countries.split(',').map((c) => c.trim().toUpperCase()),
      });
      setForm({ keyword: '', category: '', countries: '' });
      fetchKeywords();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (kw: Keyword) => {
    await updateKeyword(kw.id, { active: !kw.active });
    fetchKeywords();
  };

  const handleDelete = async (kw: Keyword) => {
    if (!confirm(`Delete "${kw.keyword}"?`)) return;
    await deleteKeyword(kw.id);
    fetchKeywords();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Mots-clés</h1>

      <div className="bg-white border rounded p-4 mb-6">
        <h2 className="text-sm font-medium mb-3">Add a keyword</h2>
        <div className="flex gap-3">
          <input
            placeholder="Keyword (e.g. men's polo)"
            value={form.keyword}
            onChange={(e) => setForm({ ...form, keyword: e.target.value })}
            className="border rounded px-3 py-1.5 text-sm flex-1"
          />
          <input
            placeholder="Category (e.g. Polos)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border rounded px-3 py-1.5 text-sm w-40"
          />
          <input
            placeholder="Countries (e.g. US,FR)"
            value={form.countries}
            onChange={(e) => setForm({ ...form, countries: e.target.value })}
            className="border rounded px-3 py-1.5 text-sm w-40"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <table className="w-full text-sm border-collapse bg-white border rounded">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="p-3">Keyword</th>
            <th className="p-3">Category</th>
            <th className="p-3">Countries</th>
            <th className="p-3">Active</th>
            <th className="p-3 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={kw.id} className={`border-b ${!kw.active ? 'opacity-50' : ''}`}>
              <td className="p-3 font-medium">{kw.keyword}</td>
              <td className="p-3">{kw.category}</td>
              <td className="p-3">{kw.countries.join(', ')}</td>
              <td className="p-3">
                <button
                  onClick={() => handleToggleActive(kw)}
                  className={`text-xs px-2 py-0.5 rounded ${kw.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {kw.active ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="p-3">
                <button onClick={() => handleDelete(kw)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
