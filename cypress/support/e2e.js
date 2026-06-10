import './commands'
import './apiCommands'
import './utils'
import './larca'

Cypress.on('uncaught:exception', (err) => {

  if (
    /Cannot read properties of undefined \(reading 'content'\)/.test(err.message) ||
    /Request failed with status code 502/.test(err.message) ||
    /Request failed with status code 406/.test(err.message) ||
    /Request failed with status code 404/.test(err.message) ||
    /Request failed with status code 500/.test(err.message) ||
    /Network Error/.test(err.message) ||
    err.message.includes('ResizeObserver loop completed with undelivered notifications') ||
    err.message.includes('ResizeObserver loop limit exceeded')
  ) {
    return false
  }

})