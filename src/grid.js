/*
  Honeycomb
  https://abbekeultjes.nl/honeycomb/
*/
import "../lib/honeycomb-grid.min.js"

const {defineHex, Grid, rectangle, spiral} = Honeycomb

// 1. Create a hex class:
const Hex = Honeycomb.defineHex({
  dimensions: 15,
  origin: 'topLeft'
})

// 2. Create a grid by passing the class and a "traverser" for a rectangular-shaped grid:
const grid = new Grid(Hex,rectangle({
  width: 32,
  height: 32
}))

const renderSVG = (hex,svg)=>{
  var hexmap = SVG('g#hexmap')
  
  const polygon = svg // create a polygon from a hex's corner points
  .polygon(hex.corners.map(({x, y})=>`${x},${y}`)).addClass('hex').data({
    qrs: [hex.q,hex.r,hex.s].join(",")
  }).click(function() {
    console.log(this.data("qrs"))
  })

  return hexmap.add(polygon)
}

const Display = (svg)=>{
  var hexmap = svg.group().attr('id','hexmap')
  //display 
  grid.forEach(hex=>renderSVG(hex, svg))

  //size 
  let bbox = hexmap.bbox()
  //resize svg
  svg.size(bbox.w, bbox.h)
  //set interaction 
  var hex = SVG.find('.hex')
}

export {Display}
