import assert from 'node:assert/strict'
import { slugify } from './src/slug.mjs'

const cases = [
  ['Hello World', 'hello-world'],
  ['  Leading and trailing  ', 'leading-and-trailing'],
  ['Crème Brûlée!', 'creme-brulee'],
  ['a -- b __ c', 'a-b-c'],
  ['', ''],
  ['Øresund Straße', 'resund-stra-e'],
  ['Room 101', 'room-101'],
]
for (const [input, want] of cases) assert.equal(slugify(input), want, `slugify(${JSON.stringify(input)})`)
console.log(`${cases.length} cases pass`)
