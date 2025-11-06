import { h, Fragment, defineRoutes, group, Link, onMount, asyncOp } from 'auwla'
import { $api } from '@/api'


function BaseLayout(child: HTMLElement) {
  return (
    <div class="container" style={{ padding: '1rem' }}>
      <nav style={{ marginBottom: '1rem', display: 'flex', gap: '.5rem' }}>
        <Link to="/" text="Home" className="btn" activeClassName="active" />
        <Link to="/about" text="About" className="btn" activeClassName="active" />
        <Link to="/todos" text="Todos" className="btn" activeClassName="active" />
        <Link to="/api-demo" text="API Demo" className="btn" activeClassName="active" />
      </nav>
      <main>{child}</main>
    </div>
  )
}

function Home() {

 async function hello(){
   try{
     const a = await $api.ping()
     console.log(a)
  }catch(e){
    console.log(e)
  }
 }

  onMount(()=>{
    hello()
  })
  return (
    <section>
      <h1>Auwla Starter</h1>
      <p>Welcome! Edit <code>src/routes.tsx</code> to add pages.</p>
    </section>
  ) as HTMLElement
}

function About() {
 
  return (
    <section>
      <h1>About</h1>
      <p>This app was scaffolded with <code>create-auwla</code>.</p>
    </section>
  ) as HTMLElement
}

function ApiDemo() {
;

  return (
    <section>
      <h1>API Demo</h1>
      <p>Testing connectivity to backend via generated client.</p>

      <p></p>
    </section>
  ) as HTMLElement
}


const baseRoutes = defineRoutes([
  { path: '/', component:() =><Home/>, name: 'home' },
  { path: '/about', component: About, name: 'about' },
  { path: '/api-demo', component: ApiDemo, name: 'api-demo' },

])

const routes = group('/', { layout: BaseLayout }, baseRoutes)

export default routes