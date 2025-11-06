import { Router, setRouter } from 'auwla'
import routes from './routes'

const container = document.getElementById('app')!
const router = new Router(routes, container)
setRouter(router)
router.start()