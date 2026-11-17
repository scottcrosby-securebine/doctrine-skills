// Draws each <svg class="wires" data-from="<selector>" data-to="<selector>"> in a figure: one curve from the right
// edge of every element the first selector matches to the left edge of every element the second matches.
// It waits for the fonts, since they decide where each box ends up.
document.fonts.ready.then(() => {
  for (const svg of document.querySelectorAll('svg.wires')) {
    const at = svg.getBoundingClientRect()
    const froms = [...document.querySelectorAll(svg.dataset.from)], tos = [...document.querySelectorAll(svg.dataset.to)]
    if (!froms.length || !tos.length) throw new Error(`wires: nothing matches ${svg.dataset.from} or ${svg.dataset.to}`)
    const mid = (r) => r.top + r.height / 2 - at.top
    for (const f of froms) for (const t of tos) {
      const a = f.getBoundingClientRect(), b = t.getBoundingClientRect()
      const x0 = a.right - at.left + 8, y0 = mid(a), x1 = b.left - at.left - 8, y1 = mid(b), c = (x0 + x1) / 2
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('d', `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1}`)
      svg.append(p)
    }
  }
})
