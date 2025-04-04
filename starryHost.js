import {starTypeData} from './astrophysics.js';

/*
  Modified from https://codepen.io/hadrianhughes/pen/mdbqGja
*/

let canvas = null
let Galaxy = null
let Points = []
let Allowable = []
let BBox = [Infinity, Infinity, 0, 0]

let buildHostInterval = null
const SPECTRAL = ["O", "B", "A", "F", "G", "K", "M"]

//constants 
const armCount = 2;
const armInterval = (Math.PI * 2) / armCount;
const starCount = 10000;
/*
  Constants Set when Fill is called 
  Initial values 
*/
let R = 500
let spinFactor = 0.5;
let armRadius = R * 0.1;
let radius = R / 2;

//counts stars in sector
const getStarsInSector = () => {
  let res = []; 
  _.fromN(2 * R/50, (i)=>_.fromN(2 * R/50, (j)=>{
		res.pusj(StarsInSector([i,j]));
	}))
  return res; 
}

//Random Generator
let RNG = new Chance()

//distribution function for spreading stars using normal distribution
const Distribute = (dev)=>{
  return RNG.normal({
    dev
  })
}

/*
  Display to canvas 
*/
const Clear = ()=>{
  let {clientWidth, clientHeight} = document.getElementById("starryHost")
  canvas.width = clientWidth
  canvas.height = clientHeight
  let ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, clientWidth, clientHeight);
  return {
    ctx,
    clientWidth,
    clientHeight
  }
}
const Display = ()=>{
	//determine bounds 
	let[xmin,ymin,xmax,ymax] = BBox
  let {ctx, clientWidth, clientHeight} = Clear()
	//figure out how to scale based upon minimum 
	let mScale = clientWidth < clientHeight ? clientWidth : clientHeight
	mScale /= 2*R*0.99

  //have to adjust for canvas size
  for (let i = 0; i < Points.length; i += 1) {
    let[_x,_y,color='white'] = Points[i]
    ctx.fillStyle = color;

    let x = clientWidth / 2 + ((_x-R)*mScale) //-xmin  
    let y = clientHeight / 2 + ((_y-R)*mScale)
    ctx.fillRect(x, y, 1, 1);
  }
}

/*
  Make an Individual Star 
*/
const MakeStar = (j,dev,color)=>{
  let center = [R, R]
  // Set location of star in context of arm
  const armMiddle = armRadius / 2;
  const relX = (Distribute(dev) * armMiddle) + armMiddle;
  const relY = Math.abs(RNG.random() - RNG.random()) * radius;
  const jAngle = armInterval * j;

  // Convert arm relative position to absolute canvas position
  const xCenterRemoved = (relY * Math.cos(jAngle)) + (relX - armRadius / 2) * Math.cos(jAngle + Math.PI / 2);
  const yCenterRemoved = (relY * Math.sin(jAngle)) + (relX - armRadius / 2) * Math.sin(jAngle + Math.PI / 2);

  // Rotate stars
  const rotationAmount = (relY * spinFactor) * (Math.PI / 180);
  const rotatedX = xCenterRemoved * Math.cos(rotationAmount) - yCenterRemoved * Math.sin(rotationAmount);
  const rotatedY = xCenterRemoved * Math.sin(rotationAmount) + yCenterRemoved * Math.cos(rotationAmount);

  //final points - add jitter 
  let p = [rotatedX + center[0], rotatedY + center[1]].map(pi=>pi * RNG.randBetween(985, 1015) / 1000)
  _.fromN(2, (i)=>{
    let mi = i + 2
    BBox[i] = p[i] < BBox[i] ? p[i] : BBox[i]
    BBox[mi] = p[i] > BBox[mi] ? p[i] : BBox[mi]
  }
  )

  p.push(color)
  Points.push(p)
}

const BuildHost = ()=>{
  if (Points.length > 20000) {
    return clearInterval(buildHostInterval);
  }
  //1000 stars of varying color 
  _.fromN(armCount, ()=>{
    let _sC = RNG.weighted([0, 1, 2, 3, 4, 5, 6], [0.0001, 0.2, 1, 3, 8, 12, 20])
    let color = starTypeData[SPECTRAL[_sC]].color
    _.fromN(1000 / armCount, (j)=>MakeStar(j, 1.5, color))
  }
  )
  //display 
  Display();
}

/*
  Intial Galaxy Fill
*/
const FillGalaxy = (G)=>{
  //clear and establish for use in other functions 
  Points = []
  canvas = document.getElementById("starryHost");
  Galaxy = G
  //set RNG 
  RNG = new Chance(G.seed + ".StarryHost")
  //reset constants based on galaxy 
  R = G._R / 100
  // radius of galaxy in LY, reduced to pixels ; average is 50000 LY
  spinFactor = (G._twist || 5) / 10;
  armRadius = R * 0.1;
  radius = R;

  let starsPerArm = Math.floor(starCount / armCount);
  //loop through arms an populate with stars 
  _.fromN(armCount, ()=>{
    //from widest distribution to least
    _.fromN(starsPerArm * 0.15, (j)=>MakeStar(j, 5))
    _.fromN(starsPerArm * 0.25, (j)=>MakeStar(j, 1.5))
    _.fromN(starsPerArm * 0.15, (j)=>MakeStar(j, 1))
    _.fromN(starsPerArm * 0.1, (j)=>MakeStar(j, 0.6))
    _.fromN(starsPerArm * 0.15, (j)=>MakeStar(j, 0.4))
    _.fromN(starsPerArm * 0.2, (j)=>MakeStar(j, 0.2))
  }
  )
  //do center bulge and galaxy scatter 
  _.fromN(2500, ()=>{
    let r = R * Math.abs(Distribute(0.1))
    let phi = RNG.randBetween(1, 360)
    Points.push([R + r * Math.cos(phi), R + r * Math.sin(phi)])
  }
  )
  _.fromN(0, ()=>{
    let r = R * Math.abs(Distribute(0.35)) / 3
    let phi = RNG.randBetween(1, 360)
    Points.push([R + r * Math.cos(phi), R + r * Math.sin(phi)])
  }
  )

  Display()

  //every 2s add colored stars 
  buildHostInterval = setInterval(()=>BuildHost(), 2000);
}

const StarsInSector = ([sx,sy]) => {
	let points = Points.filter(([px,py])=>Math.floor(px/50)==sx && Math.floor(py/50)==sy)
	return {
		points,
		p : points.length/Points.length
	}
}

export {FillGalaxy, Display, getStarsInSector, StarsInSector, BBox}
