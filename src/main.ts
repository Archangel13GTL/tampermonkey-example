import { greet } from './utils/greeter'

(function () {
  // Your userscript entry point
  console.log(greet('Tampermonkey'))

  // Example: run only on specific hosts
  if (location.hostname.includes('example.com')) {
    // Add your DOM manipulations or listeners here
    console.log('Running on example.com')
  }
})()

