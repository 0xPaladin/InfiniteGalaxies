import {GasGiantColors, RockyColors, TerrainColors} from "../data.js"
/*
  Plates and Topograpy
*/
class Plate {
  constructor(parent, i, e) {
    this.parent = parent
    this.i = i
    this._e = e
  }
  get pTopo() {
    return this.parent._topo
  }
  get hydro() {
    return Number(this.parent.hydrographics) / 100
  }
  get e() {
    return this.isWater ? this._e : this._e / 2
  }
  get isWater() {
    return this.hydro > 0 && this.i / this.pTopo.plates.length < this.hydro
  }
  get topo() {
    return this.pTopo.polys.filter(p=>p.pi == this.i)
  }
  get borders() {
    return this.topo.filter(p=>p.NdiffPlate.length > 0).reduce((b,p)=>{
      //push plate to border array 
      p.NdiffPlate.forEach(pi=>b[pi] ? b[pi].push(p) : b[pi] = [p])
      return b
    }
    , {})
  }
}

class TopoPoly {
  constructor(plate, poly, i, noise) {
    this.parent = plate
    this.i = i
    this.noise = noise

    this.e = this.plate.e + this.noise

    Object.assign(this, poly)
  }
  get plate() {
    return this.parent
  }
  get planet() {
    return this.parent.parent
  }
  get pi() {
    return this.plate.i
  }
  get isWater() {
    return this.plate.isWater
  }
  get NData() {
    return this.properties.neighbours.map(ni=>this.plate.pTopo.polys[ni])
  }
  get NdiffPlate() {
    return this.NData.filter(n=>n.pi != this.pi).map(n=>n.pi)
  }
  get dToW() {
    if (this.isWater) {
      return 0;
    }

    let i = 1
    let nd = [this]
    while (i < 5) {
      //pull neighbor data 
      nd = nd.map(p=>p.NData).flat()
      if (nd.filter(p=>p.isWater).length > 0) {
        break;
      }
      i++
    }
    return i
  }
  get color() {
    let TC = TerrainColors
    let {isWater, e, planet, properties} = this
    let[long,lat] = properties.sitecoordinates
    let {HI, color, temp} = planet

    let _e = _.clamp(e,0, 0.99)

    //mountain
    if (_e > 0.5 && !isWater) {
      return d3.interpolateLab(color, d3.color('gray').brighter(_e * 1.75))(0.75)
      //d3.color('gray').brighter(_e * 1.75)
    }

    //not habitable 
    if (HI > 2) {
      color = d3.color(color)
      //basic color step 
      let step = Math.floor(_e * 5)
      return [color.darker(0.75), color.darker(0.3), color, color.brighter(0.3), color.brighter(0.75)][step]
    }

    //no water 
    if (this.parent.hydro == 0) {
      let step = Math.floor(_e * 3)
      return d3.interpolateLab(color, `rgb(${TC.shrub[step]})`)(0.66)
      //d3.color(`rgb(${TC.shrub[step]})`)
    }

    //is water 
    if (isWater) {
      let step = Math.floor(_e * 4)
      return d3.color(`rgb(${TC.water[step]})`)
    }

    /*
      very hot ~ 70
      'hot' ~ 40 
      'temperate' ~10  arctic 66, tropics 23 
      'cold' ~ -30
      very cold ~ -25
    */
    let _lat = Math.abs(lat)
    //compute relative temp and water 
    let _temp = temp == 'hot' ? 1 : temp == 'cold' ? -1 : 0
    _temp += _lat > 75 ? -2 : _lat > 60 ? -1 : _lat < 24 ? 1 : 0
    //distance from water 
    let dToW = this.dToW
    dToW += _e > 0.35 ? 1 : 0
    dToW += dToW == 4 && this.i % 2 == 1 ? -1 : 0

    //type of vegetaion depends on distance and elevation
    let[veg,step] = dToW > 3 ? ["shrub", dToW == 4 ? 0 : 1] : ["vegetation", dToW - 1 + Math.floor(2 * _e / 0.5)]
    if (_temp < 0 && veg == "vegetation") {
      veg = "tundra"
      step = dToW - 1
    }

    return veg == 'shrub' ? d3.interpolateLab(color, `rgb(${TC.shrub[step]})`)(0.66) : d3.color(`rgb(${TC[veg][step]})`)
  }
}

export {Plate, TopoPoly}