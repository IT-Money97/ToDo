import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Baby,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Heart,
  LayoutDashboard,
  LockKeyhole,
  ListTodo,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { CATEGORIES, type Category, type Task, type TaskInput, type Workspace } from './types'

type Section = 'overview' | 'tasks' | 'budget' | 'settings'
type TaskFilter = 'Offen' | 'Alle' | 'Erledigt'
type AuthMode = 'password' | 'signup' | 'reset' | 'magic' | 'updatePassword'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const longDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })

function formatDate(value: string | null) {
  if (!value) return 'Noch kein Datum'
  const date = new Date(`${value}T12:00:00`)
  return longDate.format(date)
}

function getDaysLeft(value: string | null) {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 11) return 'Guten Morgen'
  if (hour < 18) return 'Guten Tag'
  return 'Guten Abend'
}

function App() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [section, setSection] = useState<Section>('overview')
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [workspaceSaving, setWorkspaceSaving] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'online' | 'offline'>('connecting')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [taskEditor, setTaskEditor] = useState<{ task?: Task; parentId?: string } | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('password')
  const [authNotice, setAuthNotice] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [inviteCode, setInviteCode] = useState(new URLSearchParams(window.location.search).get('invite') ?? '')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        if (_event === 'PASSWORD_RECOVERY') setAuthMode('updatePassword')
        setUser(session?.user ? { id: session.user.id, email: session.user.email } : null)
      }
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null)
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user) {
      setWorkspace(null)
      setTasks([])
      return
    }

    let active = true
    setWorkspacesLoading(true)
    void supabase
      .from('workspaces')
      .select('id, name, invite_code, event_date, owner_id')
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data, error: workspaceError }) => {
        if (!active) return
        if (workspaceError) setError(workspaceError.message)
        setWorkspace(data?.[0] ?? null)
        setWorkspacesLoading(false)
      })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!workspace) return
    setWorkspaceName(workspace.name)
    setWeddingDate(workspace.event_date ?? '')
  }, [workspace])

  const refreshTasks = useCallback(async () => {
    if (!supabase || !workspace) return
    setTasksLoading(true)
    const { data, error: taskError } = await supabase
      .from('tasks')
      .select('id, workspace_id, parent_id, title, notes, category, due_date, estimated_cost, is_paid, completed, created_at, created_by')
      .eq('workspace_id', workspace.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (taskError) {
      setError(taskError.message)
    } else {
      setTasks((data ?? []) as Task[])
    }
    setTasksLoading(false)
  }, [workspace])

  useEffect(() => {
    const client = supabase
    if (!client || !workspace) return
    let active = true
    setSyncStatus('connecting')
    void refreshTasks()
    const channel = client
      .channel(`tasks-${workspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspace.id}` }, () => {
        if (active) void refreshTasks()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspaces', filter: `id=eq.${workspace.id}` }, (payload) => {
        if (active) setWorkspace(payload.new as Workspace)
      })
      .subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          setSyncStatus('online')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSyncStatus('offline')
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Die Live-Synchronisierung ist gerade nicht erreichbar. Bitte lade die Seite neu.')
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [refreshTasks, workspace])

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
    [tasks],
  )
  const completedCount = tasks.filter((task) => task.completed).length
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0
  const plannedBudget = tasks.reduce((total, task) => total + (Number(task.estimated_cost) || 0), 0)
  const paidBudget = tasks.reduce(
    (total, task) => total + (task.is_paid ? Number(task.estimated_cost) || 0 : 0),
    0,
  )

  async function requestLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setAuthNotice('')
    setAuthBusy(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    })
    if (loginError) setError(loginError.message)
    setAuthBusy(false)
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setAuthNotice('')
    setAuthBusy(true)
    const { data, error: signupError } = await supabase.auth.signUp({
      email: loginEmail.trim(),
      password: loginPassword,
      options: { emailRedirectTo: window.location.origin },
    })
    if (signupError) {
      setError(signupError.message)
    } else if (!data.session) {
      setAuthNotice('Dein Konto wurde angelegt. Bitte bestätige einmalig den Link in deiner E-Mail und melde dich danach mit deinem Passwort an.')
    }
    setAuthBusy(false)
  }

  async function sendPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setAuthNotice('')
    setAuthBusy(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
      redirectTo: window.location.origin,
    })
    if (resetError) setError(resetError.message)
    else setAuthNotice(`Wir haben einen Link zum Festlegen deines Passworts an ${loginEmail.trim()} geschickt. Das musst du nur einmal machen.`)
    setAuthBusy(false)
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setAuthBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: loginPassword })
    if (updateError) {
      setError(updateError.message)
    } else {
      setLoginPassword('')
      setAuthMode('password')
    }
    setAuthBusy(false)
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setAuthNotice('')
    setAuthBusy(true)
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email: loginEmail.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (loginError) setError(loginError.message)
    else setAuthNotice(`Wir haben einen Anmeldelink an ${loginEmail.trim()} geschickt.`)
    setAuthBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setWorkspacesLoading(true)
    try {
      const { data, error: createError } = await supabase.rpc('create_wedding_workspace', {
        workspace_name: workspaceName.trim() || 'Gemeinsame To-dos',
        wedding_date: weddingDate || null,
      })
      if (createError) {
        setError(createError.message)
        return
      }
      const { data: created, error: readError } = await supabase
        .from('workspaces')
        .select('id, name, invite_code, event_date, owner_id')
        .eq('id', data)
        .single()
      if (readError) setError(readError.message)
      else setWorkspace(created as Workspace)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Der gemeinsame Bereich konnte nicht erstellt werden.')
    } finally {
      setWorkspacesLoading(false)
    }
  }

  async function joinWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !inviteCode.trim()) return
    setError('')
    setWorkspacesLoading(true)
    const { data, error: joinError } = await supabase.rpc('join_wedding_workspace', {
      workspace_invite_code: inviteCode.trim(),
    })
    if (joinError) {
      setError(joinError.message)
      setWorkspacesLoading(false)
      return
    }
    const { data: joined, error: readError } = await supabase
      .from('workspaces')
      .select('id, name, invite_code, event_date, owner_id')
      .eq('id', data)
      .single()
    if (readError) setError(readError.message)
    else {
      setWorkspace(joined as Workspace)
      window.history.replaceState({}, '', window.location.pathname)
    }
    setWorkspacesLoading(false)
  }

  async function saveTask(input: TaskInput, taskId?: string) {
    if (!supabase || !workspace || !user) return
    setError('')
    const result = taskId
      ? await supabase.from('tasks').update(input).eq('id', taskId).eq('workspace_id', workspace.id)
      : await supabase.from('tasks').insert({
          ...input,
          workspace_id: workspace.id,
          created_by: user.id,
        })
    if (result.error) {
      setError(result.error.message)
      throw result.error
    }
    setTaskEditor(null)
    await refreshTasks()
  }

  async function toggleTask(task: Task) {
    if (!supabase || !workspace) return
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
      .eq('workspace_id', workspace.id)
    if (updateError) setError(updateError.message)
    else await refreshTasks()
  }

  async function deleteTask(task: Task) {
    if (!supabase || !workspace || !window.confirm(`„${task.title}“ wirklich löschen? Unteraufgaben werden ebenfalls gelöscht.`)) return
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', task.id)
      .eq('workspace_id', workspace.id)
    if (deleteError) setError(deleteError.message)
    else await refreshTasks()
  }

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !workspace) return
    setError('')
    setNotice('')
    setWorkspaceSaving(true)
    try {
      const { data, error: updateError } = await supabase
        .from('workspaces')
        .update({ name: workspaceName.trim() || 'Gemeinsame To-dos', event_date: weddingDate || null })
        .eq('id', workspace.id)
        .select('id, name, invite_code, event_date, owner_id')
        .maybeSingle()
      if (updateError) {
        setError(updateError.message)
      } else if (!data) {
        setError('Die Änderungen wurden nicht gespeichert. Prüfe bitte deine Berechtigung und versuche es erneut.')
      } else {
        setWorkspace(data as Workspace)
        setNotice('Änderungen gespeichert.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Die Änderungen konnten nicht gespeichert werden.')
    } finally {
      setWorkspaceSaving(false)
    }
  }

  async function copyInvite() {
    if (!workspace) return
    const url = new URL(window.location.href)
    url.searchParams.set('invite', workspace.invite_code)
    try {
      await navigator.clipboard.writeText(url.toString())
      setNotice('Einladungslink kopiert – teile ihn mit deiner Verlobten.')
    } catch (copyError) {
      setError(copyError instanceof Error ? `Link konnte nicht kopiert werden: ${copyError.message}` : 'Link konnte nicht kopiert werden.')
    }
  }

  if (!hasSupabaseConfig) return <SetupScreen />

  if (authLoading) {
    return <LoadingScreen label="Eure To-dos werden vorbereitet …" />
  }

  if (authMode === 'updatePassword') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <BrandMark />
          <p className="eyebrow">NUR NOCH EIN SCHRITT</p>
          <h1>Passwort <em>festlegen.</em></h1>
          <p className="auth-copy">Wähle ein Passwort. Danach könnt ihr euch auf euren Geräten ohne E-Mail-Link anmelden.</p>
          <form className="auth-form" onSubmit={(event) => void updatePassword(event)}>
            <label htmlFor="recovery-password">Neues Passwort</label>
            <div className="input-with-icon"><LockKeyhole size={18} /><input id="recovery-password" type="password" autoComplete="new-password" minLength={8} placeholder="Mindestens 8 Zeichen" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></div>
            <button className="button button-primary button-wide" type="submit" disabled={authBusy}>{authBusy ? 'Wird gespeichert …' : 'Passwort speichern'} <ArrowRight size={17} /></button>
          </form>
          {error && <InlineMessage>{error}</InlineMessage>}
        </section>
      </main>
    )
  }

  if (!user) {
    const isSignup = authMode === 'signup'
    const isReset = authMode === 'reset'
    const isMagic = authMode === 'magic'
    const authHeading = isSignup
      ? <>Konto <em>anlegen.</em></>
      : isReset
        ? <>Passwort <em>zurücksetzen.</em></>
        : isMagic
          ? <>Mit E-Mail-Link <em>anmelden.</em></>
          : <>Eure To-dos,<br /><em>gemeinsam im Blick.</em></>

    return (
      <main className="auth-page">
        <div className="auth-decoration" aria-hidden="true"><span /><span /><span /></div>
        <section className="auth-card">
          <BrandMark />
          <p className="eyebrow">EINFACH GEMEINSAM ORGANISIERT</p>
          <h1>{authHeading}</h1>
          <p className="auth-copy">{isSignup ? 'Erstellt euer gemeinsames Konto für eure Aufgaben und Pläne.' : isReset ? 'Du musst dein Passwort nur einmal über einen Link aus deiner E-Mail festlegen.' : isMagic ? 'Wir schicken einen einmaligen Anmeldelink an deine E-Mail-Adresse.' : 'Aufgaben gemeinsam sammeln, Termine im Blick behalten und Erledigtes abhaken.'}</p>
          {authNotice ? (
            <div className="mail-success">
              <span className="success-icon"><Mail size={21} /></span>
              <h2>Schau in dein Postfach</h2>
              <p>{authNotice}</p>
              <button className="text-button" onClick={() => { setAuthNotice(''); setAuthMode('password') }}>Zurück zur Anmeldung</button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={(event) => {
              if (isSignup) void createAccount(event)
              else if (isReset) void sendPasswordReset(event)
              else if (isMagic) void sendMagicLink(event)
              else void requestLogin(event)
            }}>
              <label htmlFor="login-email">E-Mail-Adresse</label>
              <div className="input-with-icon"><Mail size={18} /><input id="login-email" type="email" autoComplete="email" placeholder="ihr@beispiel.de" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required /></div>
              {!isReset && !isMagic && (
                <>
                  <label htmlFor="login-password">{isSignup ? 'Passwort wählen' : 'Passwort'}</label>
                  <div className="input-with-icon"><LockKeyhole size={18} /><input id="login-password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 8 : undefined} placeholder={isSignup ? 'Mindestens 8 Zeichen' : 'Dein Passwort'} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></div>
                </>
              )}
              <button className="button button-primary button-wide" type="submit" disabled={authBusy}>
                {authBusy ? 'Einen Moment …' : isSignup ? 'Konto anlegen' : isReset ? 'Passwort-Link senden' : isMagic ? 'Anmeldelink senden' : 'Anmelden'}
                {!authBusy && <ArrowRight size={17} />}
              </button>
              {authMode === 'password' && <button className="auth-link auth-forgot" type="button" onClick={() => { setError(''); setAuthMode('reset') }}>Passwort vergessen?</button>}
              <p className="form-footnote">{authMode === 'password' ? 'Einmal anmelden – auf diesem Gerät eingeloggt bleiben.' : isSignup ? 'Einmalige E-Mail-Bestätigung kann erforderlich sein.' : ''}</p>
            </form>
          )}
          <p className="privacy-note"><Heart size={13} fill="currentColor" /> Euer gemeinsamer Bereich bleibt privat.</p>
          {error && <InlineMessage>{error}</InlineMessage>}
          {!authNotice && (
            <div className="auth-alternatives">
              {authMode === 'password' ? (
                <>
                  <p>Noch kein Konto? <button className="auth-link" onClick={() => { setError(''); setAuthMode('signup') }}>Konto anlegen</button></p>
                  <p><button className="auth-link" onClick={() => { setError(''); setAuthMode('magic') }}>Stattdessen mit E-Mail-Link anmelden</button></p>
                </>
              ) : (
                <p><button className="auth-link" onClick={() => { setError(''); setAuthNotice(''); setAuthMode('password') }}>Zurück zur Passwort-Anmeldung</button></p>
              )}
            </div>
          )}
        </section>
      </main>
    )
  }

  if (workspacesLoading && !workspace) return <LoadingScreen label="Eure To-dos werden geladen …" />

  if (!workspace) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <BrandMark />
          <p className="eyebrow">EINFACH GEMEINSAM ORGANISIERT</p>
          <h1>Eure To-dos,<br /><em>an einem Ort.</em></h1>
          <p className="auth-copy">Erstellt einen privaten Bereich und legt direkt los. Name und Datum könnt ihr hinzufügen, müsst ihr aber nicht.</p>
          <form className="setup-form" onSubmit={(event) => void createWorkspace(event)}>
            <button className="button button-primary button-wide" disabled={workspacesLoading}>{workspacesLoading ? 'Wird erstellt …' : 'Gemeinsame To-dos starten'} {!workspacesLoading && <ArrowRight size={17} />}</button>
            <details className="optional-setup">
              <summary>Name oder Datum hinzufügen <span>optional</span></summary>
              <label htmlFor="workspace-name">Name des Bereichs</label>
              <input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={60} placeholder="Gemeinsame To-dos" />
              <label htmlFor="wedding-date">Wichtiges Datum</label>
              <input id="wedding-date" type="date" value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} />
            </details>
          </form>
          <details className="join-details">
            <summary>Du hast schon einen Einladungscode?</summary>
            <form className="join-form" onSubmit={(event) => void joinWorkspace(event)}>
              <label htmlFor="invite-code">Einladungscode</label>
              <div className="join-row"><input id="invite-code" placeholder="Code eingeben" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} required /><button className="button button-soft" disabled={workspacesLoading}>Beitreten</button></div>
            </form>
          </details>
          {error && <InlineMessage>{error}</InlineMessage>}
          <button className="text-button setup-signout" onClick={() => void signOut()}><LogOut size={14} /> Abmelden</button>
        </section>
      </main>
    )
  }

  const pendingTopLevel = sortedTasks.filter((task) => !task.completed && !task.parent_id)
  const upcomingTasks = pendingTopLevel
    .filter((task) => task.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 4)
  const dueDays = getDaysLeft(workspace.event_date)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><BrandMark compact /><span>zusammen<small>GEMEINSAM ORGANISIERT</small></span></div>
        <div className="workspace-pill"><span className="workspace-dot" />{workspace.name}<ChevronDown size={14} /></div>
        <p className="nav-label">EURE TO-DOS</p>
        <nav className="main-nav" aria-label="Hauptnavigation">
          <NavButton section="overview" active={section} onClick={setSection} icon={<LayoutDashboard size={18} />}>Übersicht</NavButton>
          <NavButton section="tasks" active={section} onClick={setSection} icon={<ListTodo size={18} />}>Alle Aufgaben<span className="nav-count">{tasks.filter((task) => !task.completed).length}</span></NavButton>
          <NavButton section="budget" active={section} onClick={setSection} icon={<Wallet size={18} />}>Budget & Kosten</NavButton>
          <NavButton section="settings" active={section} onClick={setSection} icon={<Settings2 size={18} />}>Einstellungen</NavButton>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><Heart size={16} /><p>Ein Schritt nach dem anderen.<br /><strong>Ihr macht das wunderbar.</strong></p></div>
          <button className="user-account" onClick={() => void signOut()} title="Abmelden">
            <span className="avatar">{user.email?.[0]?.toUpperCase() ?? 'I'}</span><span className="user-email">{user.email}<small>Abmelden</small></span><LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu-button" aria-label="Menü öffnen" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={21} /></button>
          <div className="breadcrumb">Unsere Planung <ChevronRight size={15} /> <span>{sectionTitle(section)}</span></div>
          <div className="topbar-right"><span className={`sync-indicator${syncStatus === 'offline' ? ' offline' : ''}`}><span />{syncStatus === 'online' ? 'Live synchronisiert' : syncStatus === 'offline' ? 'Verbindung prüfen' : 'Synchronisierung …'}</span><button className="topbar-avatar" title={user.email}>{user.email?.[0]?.toUpperCase() ?? 'I'}</button></div>
        </header>

        {mobileMenuOpen && <div className="mobile-menu"><nav aria-label="Mobile Navigation">{(['overview', 'tasks', 'budget', 'settings'] as Section[]).map((item) => <NavButton key={item} section={item} active={section} onClick={(next) => { setSection(next); setMobileMenuOpen(false) }} icon={navIcon(item)}>{sectionTitle(item)}</NavButton>)}</nav><button className="text-button" onClick={() => void signOut()}><LogOut size={15} /> Abmelden</button></div>}

        <div className="content-wrap">
          {error && <InlineMessage onClose={() => setError('')}>{error}</InlineMessage>}
          {notice && <InlineMessage success onClose={() => setNotice('')}>{notice}</InlineMessage>}

          {section === 'overview' && (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">{greeting()} – SCHÖN, DASS IHR DA SEID</p><h1>Gemeinsam den <em>Überblick behalten.</em></h1><p>Aufgaben sammeln, Termine planen und Schritt für Schritt erledigen.</p></div>
                <button className="button button-primary heading-action" onClick={() => setTaskEditor({})}><Plus size={17} /> Aufgabe hinzufügen</button>
              </div>
              <section className="hero-card">
                <div className="hero-copy"><span className="hero-kicker"><Sparkles size={14} /> GEMEINSAMER ÜBERBLICK</span><h2>{dueDays === null ? 'Alles Wichtige im Blick.' : dueDays < 0 ? 'Euer Termin liegt hinter euch.' : dueDays === 0 ? 'Heute ist euer wichtiger Tag!' : `Noch ${dueDays} ${dueDays === 1 ? 'Tag' : 'Tage'} bis zu eurem Termin.`}</h2><p>{workspace.event_date ? formatDate(workspace.event_date) : 'Eure To-dos, Termine und Kosten an einem Ort.'}</p></div>
                <div className="hero-flower" aria-hidden="true"><span className="flower-center" /><i /><i /><i /><i /><i /><i /></div>
                <div className="hero-progress"><div className="progress-label"><span>Fortschritt bei euren Aufgaben</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{completedCount} von {tasks.length} Aufgaben erledigt</small></div>
              </section>
              <div className="stats-grid">
                <StatCard icon={<ListTodo size={18} />} label="Noch offen" value={String(tasks.filter((task) => !task.completed).length)} detail="Aufgaben, die noch anstehen" tone="rose" />
                <StatCard icon={<Wallet size={18} />} label="Geplantes Budget" value={money.format(plannedBudget)} detail={`${money.format(paidBudget)} bereits bezahlt`} tone="sage" />
                <StatCard icon={<CalendarDays size={18} />} label="Nächster Termin" value={upcomingTasks[0]?.due_date ? shortDate.format(new Date(`${upcomingTasks[0].due_date}T12:00:00`)) : 'Noch offen'} detail={upcomingTasks[0]?.title ?? 'Datum bei einer Aufgabe ergänzen'} tone="sand" />
              </div>
              <section className="section-card">
                <div className="section-heading"><div><p className="eyebrow">EURE NÄCHSTEN SCHRITTE</p><h2>Was steht bald an?</h2></div><button className="text-button" onClick={() => setSection('tasks')}>Alle Aufgaben <ArrowRight size={15} /></button></div>
                {tasksLoading ? <LoadingInline /> : upcomingTasks.length ? <div className="upcoming-list">{upcomingTasks.map((task) => <div className="upcoming-item" key={task.id}><button className="check-button" aria-label={`„${task.title}“ abhaken`} onClick={() => void toggleTask(task)}><Circle size={20} /></button><div className="upcoming-main"><strong>{task.title}</strong><span>{task.category}{task.parent_id ? ' · Unteraufgabe' : ''}</span></div><span className="upcoming-date"><CalendarDays size={14} />{formatDate(task.due_date)}</span><button className="row-arrow" aria-label="Aufgabe bearbeiten" onClick={() => setTaskEditor({ task })}><ArrowRight size={16} /></button></div>)}</div> : <EmptyState title="Hier ist noch Platz für eure Pläne" copy="Fügt eine Aufgabe mit Datum hinzu – sie erscheint dann hier." action={() => setTaskEditor({})} />}
              </section>
              <div className="quote-card"><span className="quote-heart"><CheckCircle2 size={20} /></span><p>Ein Schritt nach dem anderen – gemeinsam behaltet ihr alles im Blick.</p><span>GUT GEMACHT, IHR ZWEI</span></div>
            </>
          )}

          {section === 'tasks' && (
            <TasksPage
              tasks={sortedTasks}
              loading={tasksLoading}
              onAdd={() => setTaskEditor({})}
              onEdit={(task) => setTaskEditor({ task })}
              onDelete={(task) => void deleteTask(task)}
              onToggle={(task) => void toggleTask(task)}
              onAddChild={(parentId) => setTaskEditor({ parentId })}
            />
          )}

          {section === 'budget' && (
            <BudgetPage tasks={tasks} total={plannedBudget} paid={paidBudget} onAdd={() => setTaskEditor({})} onEdit={(task) => setTaskEditor({ task })} />
          )}

          {section === 'settings' && (
            <section className="settings-page">
              <div className="page-heading"><div><p className="eyebrow">ALLES AN EINEM ORT</p><h1>Eure <em>Einstellungen.</em></h1><p>Name und wichtiges Datum könnt ihr festlegen – beides ist optional.</p></div></div>
              <form className="section-card settings-form" onSubmit={(event) => void saveWorkspace(event)}>
                <div className="section-heading"><div><p className="eyebrow">EUREN TAG</p><h2>Planungsdetails</h2></div><span className="settings-icon"><CalendarDays size={20} /></span></div>
                <label htmlFor="settings-name">Name des Bereichs <span>optional</span></label><input id="settings-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={60} placeholder="Gemeinsame To-dos" />
                <label htmlFor="settings-date">Wichtiges Datum <span>optional</span></label><input id="settings-date" type="date" value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} />
                <button className="button button-primary" type="submit" disabled={workspaceSaving}>{workspaceSaving ? 'Wird gespeichert …' : 'Änderungen speichern'} {!workspaceSaving && <Check size={16} />}</button>
              </form>
              <section className="section-card invite-card"><div><p className="eyebrow">ZUSAMMEN PLANEN</p><h2>Teilt eure To-dos</h2><p>Teile den privaten Einladungslink mit der Person, mit der du gemeinsam planen möchtest.</p></div><div className="invite-code-row"><div><span>EUER EINLADUNGSCODE</span><strong>{workspace.invite_code}</strong></div><button className="button button-soft" onClick={() => void copyInvite()}><Copy size={16} /> Einladungslink kopieren</button></div></section>
              <section className="section-card privacy-card"><span><Heart size={18} /></span><div><strong>Privat und gemeinsam</strong><p>Eure Aufgaben und Kosten sehen nur die angemeldeten Mitglieder dieses Bereichs.</p></div></section>
            </section>
          )}
          <footer className="app-footer">          <span>Zusammen den Überblick behalten</span><Heart size={13} /></footer>
        </div>
      </main>

      {taskEditor && (
        <TaskEditor
          key={taskEditor.task?.id ?? taskEditor.parentId ?? 'new-task'}
          task={taskEditor.task}
          parent={taskEditor.parentId ? tasks.find((task) => task.id === taskEditor.parentId) : undefined}
          onClose={() => setTaskEditor(null)}
          onSave={(input) => saveTask(input, taskEditor.task?.id)}
          onDelete={taskEditor.task ? () => { void deleteTask(taskEditor.task!); setTaskEditor(null) } : undefined}
        />
      )}
    </div>
  )
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card config-card">
        <BrandMark />
        <p className="eyebrow">FAST BEREIT FÜR EURE GESCHICHTE</p>
        <h1>Eure To-dos,<br /><em>an einem Ort.</em></h1>
        <p className="auth-copy">Für Anmeldung und gemeinsame Live-Synchronisierung muss noch euer Supabase-Projekt verbunden werden.</p>
        <div className="config-checklist"><div><CheckCircle2 size={19} /><span>iPhone-optimierte, installierbare App</span></div><div><CheckCircle2 size={19} /><span>Private gemeinsame To-dos per Einladung</span></div><div><CheckCircle2 size={19} /><span>Aufgaben, Unteraufgaben, Termine und Kosten</span></div></div>
        <p className="config-help">Folge der Anleitung in <strong>README.md</strong>, um Supabase zu verbinden und die App anschließend über Vercel online zu stellen.</p>
      </section>
    </main>
  )
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="loading-screen"><LoaderCircle className="spin" size={24} /><span>{label}</span></main>
}

function LoadingInline() {
  return <div className="loading-inline"><LoaderCircle className="spin" size={19} />Wird geladen …</div>
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark${compact ? ' brand-mark-small' : ''}`}><Heart size={compact ? 17 : 22} fill="currentColor" /><span>zusammen</span></div>
}

function InlineMessage({ children, onClose, success = false }: { children: ReactNode; onClose?: () => void; success?: boolean }) {
  return <div className={`inline-message${success ? ' inline-success' : ''}`} role="status">{children}{onClose && <button aria-label="Meldung schließen" onClick={onClose}><X size={15} /></button>}</div>
}

function sectionTitle(section: Section) {
  return ({ overview: 'Übersicht', tasks: 'Alle Aufgaben', budget: 'Budget & Kosten', settings: 'Einstellungen' })[section]
}

function navIcon(section: Section) {
  return {
    overview: <LayoutDashboard size={18} />,
    tasks: <ListTodo size={18} />,
    budget: <Wallet size={18} />,
    settings: <Settings2 size={18} />,
  }[section]
}

function NavButton({ section, active, onClick, icon, children }: { section: Section; active: Section; onClick: (section: Section) => void; icon: ReactNode; children: ReactNode }) {
  return <button className={`nav-button${section === active ? ' active' : ''}`} onClick={() => onClick(section)}>{icon}<span>{children}</span>{section === active && <span className="nav-active-dot" />}</button>
}

function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action: () => void }) {
  return <div className="empty-state"><span><Baby size={22} /></span><h3>{title}</h3><p>{copy}</p><button className="button button-soft" onClick={action}><Plus size={15} /> Erste Aufgabe anlegen</button></div>
}

function TasksPage({ tasks, loading, onAdd, onEdit, onDelete, onToggle, onAddChild }: {
  tasks: Task[]
  loading: boolean
  onAdd: () => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onToggle: (task: Task) => void
  onAddChild: (id: string) => void
}) {
  const [filter, setFilter] = useState<TaskFilter>('Offen')
  const [category, setCategory] = useState<string>('Alle Bereiche')
  const [query, setQuery] = useState('')
  const matchesFilters = (task: Task) => {
    if (filter === 'Offen' && task.completed) return false
    if (filter === 'Erledigt' && !task.completed) return false
    if (category !== 'Alle Bereiche' && task.category !== category) return false
    return !query || `${task.title} ${task.notes ?? ''}`.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de'))
  }
  const visibleIds = new Set<string>()
  for (const match of tasks.filter(matchesFilters)) {
    let current: Task | undefined = match
    while (current) {
      visibleIds.add(current.id)
      current = current.parent_id ? tasks.find((task) => task.id === current?.parent_id) : undefined
    }
  }
  const filtered = tasks.filter((task) => visibleIds.has(task.id))
  const roots = filtered.filter((task) => !task.parent_id)
  return (
    <section className="tasks-page">
      <div className="page-heading"><div><p className="eyebrow">SCHRITT FÜR SCHRITT ZUM GROSSEN TAG</p><h1>Eure <em>Aufgaben.</em></h1><p>Alles Wichtige an einem Ort – und jeder kleine Haken bringt euch näher.</p></div><button className="button button-primary heading-action" onClick={onAdd}><Plus size={17} /> Neue Aufgabe</button></div>
      <div className="task-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Aufgaben filtern">{(['Offen', 'Alle', 'Erledigt'] as TaskFilter[]).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}<span>{item === 'Alle' ? tasks.length : item === 'Erledigt' ? tasks.filter((task) => task.completed).length : tasks.filter((task) => !task.completed).length}</span></button>)}</div>
        <label className="search-field"><Search size={16} /><input aria-label="Aufgaben suchen" placeholder="Aufgabe suchen" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Bereich filtern" className="category-select" value={category} onChange={(event) => setCategory(event.target.value)}><option>Alle Bereiche</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <section className="section-card task-list-card">
        <div className="task-list-head"><span>AUFGABE</span><span>BEREICH</span><span>TERMIN</span><span>KOSTEN</span></div>
        {loading ? <LoadingInline /> : roots.length ? roots.map((task) => <TaskTree key={task.id} task={task} tasks={filtered} depth={0} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />) : <EmptyState title={query || category !== 'Alle Bereiche' || filter !== 'Offen' ? 'Keine passenden Aufgaben' : 'Eure Liste wartet auf euch'} copy={query || category !== 'Alle Bereiche' || filter !== 'Offen' ? 'Ändert den Filter oder die Suche.' : 'Sammelt eure Ideen und macht aus großen Plänen kleine Schritte.'} action={onAdd} />}
      </section>
      <div className="subtask-tip"><ArrowDownRight size={16} /><span>Tipp: Über das Plus an einer Aufgabe könnt ihr Unteraufgaben ergänzen und große Pläne in kleine Schritte teilen.</span></div>
    </section>
  )
}

function TaskTree({ task, tasks, depth, onToggle, onEdit, onDelete, onAddChild }: {
  task: Task
  tasks: Task[]
  depth: number
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onAddChild: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const children = tasks.filter((item) => item.parent_id === task.id)
  const dueLabel = task.due_date ? shortDate.format(new Date(`${task.due_date}T12:00:00`)) : '–'
  return (
    <>
      <div className={`task-row${task.completed ? ' task-completed' : ''}${depth ? ' task-child' : ''}`} style={{ '--depth': depth } as React.CSSProperties}>
        <div className="task-title-cell">
          {children.length ? <button className="expand-button" aria-label={expanded ? 'Unteraufgaben einklappen' : 'Unteraufgaben ausklappen'} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="expand-spacer" />}
          <button className={`task-checkbox${task.completed ? ' checked' : ''}`} aria-label={task.completed ? `„${task.title}“ als offen markieren` : `„${task.title}“ abhaken`} onClick={() => void onToggle(task)}>{task.completed && <Check size={13} />}</button>
          <button className="task-name-button" onClick={() => onEdit(task)}><strong>{task.title}</strong>{task.notes && <span>{task.notes}</span>}</button>
          {children.length > 0 && <span className="subtask-count">{children.filter((child) => child.completed).length}/{children.length}</span>}
        </div>
        <span className={`category-chip category-${categoryClass(task.category)}`}>{task.category}</span>
        <span className="task-date"><CalendarDays size={14} />{dueLabel}</span>
        <span className="task-cost">{task.estimated_cost ? money.format(Number(task.estimated_cost)) : '–'}{task.is_paid && task.estimated_cost ? <CheckCircle2 className="paid-check" size={13} /> : null}</span>
        <div className="task-actions"><button title="Unteraufgabe hinzufügen" aria-label="Unteraufgabe hinzufügen" onClick={() => onAddChild(task.id)}><Plus size={15} /></button><button title="Bearbeiten" aria-label="Bearbeiten" onClick={() => onEdit(task)}><Settings2 size={15} /></button><button title="Löschen" aria-label="Löschen" onClick={() => onDelete(task)}><X size={15} /></button></div>
      </div>
      {expanded && children.map((child) => <TaskTree key={child.id} task={child} tasks={tasks} depth={depth + 1} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />)}
    </>
  )
}

function categoryClass(category: string) {
  return category.toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss').replaceAll(/[^a-z0-9]+/g, '-')
}

function BudgetPage({ tasks, total, paid, onAdd, onEdit }: { tasks: Task[]; total: number; paid: number; onAdd: () => void; onEdit: (task: Task) => void }) {
  const expenses = tasks.filter((task) => Number(task.estimated_cost) > 0).sort((a, b) => Number(b.estimated_cost) - Number(a.estimated_cost))
  const groups = CATEGORIES.map((category) => {
    const categoryTasks = expenses.filter((task) => task.category === category)
    return { category, total: categoryTasks.reduce((sum, task) => sum + Number(task.estimated_cost), 0), count: categoryTasks.length }
  }).filter((group) => group.count > 0)
  const remaining = Math.max(total - paid, 0)
  return (
    <section className="budget-page">
      <div className="page-heading"><div><p className="eyebrow">EURE KOSTEN IM ÜBERBLICK</p><h1>Mit Liebe geplant,<br /><em>im Blick behalten.</em></h1><p>Damit die Vorfreude groß und die Überraschungen klein bleiben.</p></div><button className="button button-primary heading-action" onClick={onAdd}><Plus size={17} /> Kosten eintragen</button></div>
      <div className="budget-overview">
        <article className="budget-total-card"><span className="hero-kicker"><Wallet size={15} /> EURE PLANUNG</span><span className="budget-total">{money.format(total)}</span><span>Gesamtkosten aus euren Aufgaben</span><div className="budget-bar"><span style={{ width: `${total ? Math.min(paid / total * 100, 100) : 0}%` }} /></div><div className="budget-legend"><span><i className="legend-paid" /> Bezahlt <strong>{money.format(paid)}</strong></span><span><i className="legend-open" /> Noch offen <strong>{money.format(remaining)}</strong></span></div></article>
        <article className="budget-side-card"><span className="stat-icon sand"><CheckCircle2 size={18} /></span><span className="stat-label">Schon bezahlt</span><strong>{total ? Math.round(paid / total * 100) : 0}<small>%</small></strong><p>Schritt für Schritt kommt ihr eurem Wunschtag näher.</p></article>
      </div>
      <div className="budget-columns">
        <section className="section-card"><div className="section-heading"><div><p className="eyebrow">NACH BEREICH</p><h2>So verteilt es sich</h2></div></div>{groups.length ? <div className="category-budget-list">{groups.map((group, index) => <div className="category-budget-row" key={group.category}><span className={`budget-category-icon tone-${index % 4}`}><Wallet size={16} /></span><div className="category-budget-name"><strong>{group.category}</strong><small>{group.count} {group.count === 1 ? 'Aufgabe' : 'Aufgaben'}</small></div><strong>{money.format(group.total)}</strong></div>)}</div> : <div className="budget-empty"><p>Hier erscheinen eure geplanten Kosten.</p><button className="text-button" onClick={onAdd}>Erste Kosten ergänzen <ArrowRight size={15} /></button></div>}</section>
        <section className="section-card"><div className="section-heading"><div><p className="eyebrow">EURE AUSGABEN</p><h2>Einzelne Posten</h2></div></div>        {expenses.length ? <div className="expense-list">{expenses.map((task) => <button className="expense-row" key={task.id} onClick={() => onEdit(task)}><span className={`expense-status${task.is_paid ? ' paid' : ''}`}>{task.is_paid ? <Check size={13} /> : <Clock3 size={13} />}</span><span><strong>{task.title}</strong><small>{task.category}{task.due_date ? ` · ${shortDate.format(new Date(`${task.due_date}T12:00:00`))}` : ''}</small></span><strong>{money.format(Number(task.estimated_cost))}</strong></button>)}</div> : <div className="budget-empty"><p>Ergänzt Kosten direkt bei euren Aufgaben.</p></div>}</section>
      </div>
      <p className="budget-disclaimer">Der Gesamtbetrag zählt die Kosten jedes einzelnen Aufgabenpostens. Tragt Kosten entweder bei einer Aufgabe oder ihren Unteraufgaben ein, damit nichts doppelt gezählt wird.</p>
    </section>
  )
}

function TaskEditor({ task, parent, onClose, onSave, onDelete }: {
  task?: Task
  parent?: Task
  onClose: () => void
  onSave: (input: TaskInput) => Promise<void>
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [category, setCategory] = useState<Category>((CATEGORIES.find((item) => item === task?.category) ?? parent?.category ?? 'Allgemein') as Category)
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [cost, setCost] = useState(task?.estimated_cost?.toString() ?? '')
  const [paid, setPaid] = useState(task?.is_paid ?? false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedCost = cost.trim() ? Number(cost) : null
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setFormError('Bitte gib einen gültigen Betrag ab 0 € ein.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await onSave({
        title: title.trim(),
        notes: notes.trim() || null,
        category,
        due_date: dueDate || null,
        estimated_cost: parsedCost,
        is_paid: paid,
        parent_id: task?.parent_id ?? parent?.id ?? null,
      })
    } catch {
      setFormError('Die Aufgabe konnte nicht gespeichert werden. Bitte prüft eure Verbindung.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-heading"><div><span className="modal-icon"><Sparkles size={18} /></span><div><p className="eyebrow">{parent ? 'KLEINE SCHRITTE HELFEN' : 'EURE HOCHZEITSPLANUNG'}</p><h2 id="task-modal-title">{task ? 'Aufgabe bearbeiten' : parent ? 'Unteraufgabe anlegen' : 'Neue Aufgabe'}</h2></div></div><button className="icon-button" aria-label="Schließen" onClick={onClose}><X size={19} /></button></div>
        {parent && <div className="parent-context"><ArrowDownRight size={16} /> Unteraufgabe für <strong>{parent.title}</strong></div>}
        <form className="task-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="task-title">Was möchtet ihr erledigen? <span>*</span></label><input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="z. B. Einkauf planen" autoFocus required />
          <label htmlFor="task-notes">Notizen <span className="optional">optional</span></label><textarea id="task-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={1000} placeholder="Details, Ansprechpartner, Ideen …" />
          <div className="form-grid"><div><label htmlFor="task-category">Bereich</label><select id="task-category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="task-date">Termin</label><input id="task-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div>
          <label htmlFor="task-cost">Geplante Kosten <span className="optional">optional</span></label><div className="cost-input"><input id="task-cost" type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0,00" /><span>EUR</span></div>
          <label className="paid-toggle"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} /><span className="custom-checkbox">{paid && <Check size={12} />}</span><span>Diese Kosten sind bereits bezahlt</span></label>
          {formError && <InlineMessage>{formError}</InlineMessage>}
          <div className="modal-actions">{onDelete && <button type="button" className="delete-button" onClick={onDelete}>Aufgabe löschen</button>}<button type="button" className="button button-quiet" onClick={onClose}>Abbrechen</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{task ? 'Speichern' : 'Hinzufügen'}</button></div>
        </form>
      </section>
    </div>
  )
}

export default App
