import { h, Fragment, defineRoutes, group, Link } from 'auwla'
import { $api } from '../../server/client-$api'

function BaseLayout(child: HTMLElement) {
  return (
    <div class="container" style={{ padding: '1rem' }}>
      <nav style={{ marginBottom: '1rem', display: 'flex', gap: '.5rem' }}>
        <Link to="/" text="Home" className="btn" activeClassName="active" />
        <Link to="/about" text="About" className="btn" activeClassName="active" />
        <Link to="/users/42" text="User 42" className="btn" activeClassName="active" />
        <Link to="/api-test" text="API Test" className="btn" activeClassName="active" />
      </nav>
      <main>{child}</main>
    </div>
  )
}

function Home() {
  return (
    <section>
      <h1>Auwla Starter</h1>
      <p>Welcome! Edit <code>src/routes.tsx</code> to add pages.</p>
      <p>✨ Now with Bun adapter API integration!</p>
    </section>
  ) as HTMLElement
}

function ApiTest() {
  const section = (
    <section>
      <h1>API Test</h1>
      <p>Testing the type-safe $api client with Bun adapter</p>
      
      <div style={{ marginTop: '1rem' }}>
        <button id="test-ping" class="btn">Test Ping</button>
        <button id="test-create-user" class="btn" style={{ marginLeft: '0.5rem' }}>Create User</button>
        <button id="test-get-user" class="btn" style={{ marginLeft: '0.5rem' }}>Get User</button>
      </div>
      
      <pre id="api-result" style={{ 
        marginTop: '1rem', 
        padding: '1rem', 
        background: '#f5f5f5', 
        borderRadius: '4px',
        minHeight: '100px'
      }}>
        Click a button to test the API...
      </pre>
    </section>
  ) as HTMLElement

  // Add event listeners after element is created
  setTimeout(() => {
    const resultEl = document.getElementById('api-result')!
    
    document.getElementById('test-ping')?.addEventListener('click', async () => {
      try {
        resultEl.textContent = 'Loading...'
        const result = await $api.ping()
        resultEl.textContent = JSON.stringify(result, null, 2)
      } catch (error) {
        resultEl.textContent = `Error: ${error}`
      }
    })
    
    document.getElementById('test-create-user')?.addEventListener('click', async () => {
      try {
        resultEl.textContent = 'Loading...'
        const result = await $api.createUser({
          name: 'Test User',
          email: 'test@example.com'
        })
        resultEl.textContent = JSON.stringify(result, null, 2)
      } catch (error) {
        resultEl.textContent = `Error: ${error}`
      }
    })
    
    document.getElementById('test-get-user')?.addEventListener('click', async () => {
      try {
        resultEl.textContent = 'Loading...'
        const result = await $api.getUserById({ id: '123' })
        resultEl.textContent = JSON.stringify(result, null, 2)
      } catch (error) {
        resultEl.textContent = `Error: ${error}`
      }
    })
  }, 0)
  
  return section
}

function About() {
  return (
    <section>
      <h1>About</h1>
      <p>This app was scaffolded with <code>create-auwla</code>.</p>
    </section>
  ) as HTMLElement
}


function User(params?: any) {
  return (
    <section>
      <h1>User</h1>
      <p>ID: {params?.id ?? ""}</p>
    </section>
  ) as HTMLElement
}

const baseRoutes = defineRoutes([
  { path: '/', component: Home, name: 'home' },
  { path: '/about', component: About, name: 'about' },
  { path: '/users/:id', component: User, name: 'user' },
  { path: '/api-test', component: ApiTest, name: 'api-test' },
])

const routes = group('/', { layout: BaseLayout }, baseRoutes)

export default routes