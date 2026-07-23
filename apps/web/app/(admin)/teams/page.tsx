'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Team = {
  id: string;
  name: string;
  status: string;
  manager: { name: string } | null;
  _count: { users: number };
};
export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    api<{ teams: Team[] }>('/teams')
      .then((r) => setTeams(r.teams))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api('/teams', { method: 'POST', body: JSON.stringify({ name: data.get('name') }) });
      form.reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成できませんでした');
    }
  }
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STRUCTURE</p>
          <h1>チーム</h1>
        </div>
      </div>
      <section className="panel">
        <form className="inline-form" onSubmit={(event) => void create(event)}>
          <input name="name" placeholder="新しいチーム名" required />
          <button>チームを作成</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
      <section className="cards">
        {teams.map((team) => (
          <article className="panel" key={team.id}>
            <span className="tag">{team.status}</span>
            <h2>{team.name}</h2>
            <p>責任者: {team.manager?.name ?? '未設定'}</p>
            <strong>{team._count.users}名</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
