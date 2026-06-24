const chance = new Chance()
const RandBetween = (min,max,RNG=chance)=>RNG.integer({
  min,
  max
})
const DiceArray = (dice,RNG=chance)=>{
  let res = dice.map(d=>{
    let n = Number(d.split("d")[1])
    let r = RandBetween(1, n, RNG)
    return [d, r, -1]
  }
  )
  return res
}
const SumDice = (dice,RNG=chance)=>{
  let[d,b=0] = dice.split("+")
  return Number(b) + RNG.rpg(d, {
    sum: true
  })
}
const Likely = (likelihood=50,RNG=chance)=>RNG.bool({
  likelihood
})
const ZeroOne = (RNG=chance)=>RNG.bool() ? 1 : 0
const Difficulty = (RNG=chance)=>RNG.weighted([0, 1, 2, 3, 4], [30, 35, 23, 10, 2])

const WeightedString = (str,RNG=chance)=>{
  let[w,p] = str.split("/").map(w=>w.split(","))
  if (w.length != p.length) {
    console.log(str)
  }
  return RNG.weighted(w, p.map(Number))
}

/*
  Non Random Helper Functions 
*/
const Hash = (toHash)=>{
  let str = Array.isArray(toHash) ? toHash.join() : typeof toHash === "object" ? JSON.stringify(toHash) : toHash

  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
    // Convert to 32bit integer
  }
  return hash.toString(16);
}

const SpliceOrPush = (arr,what)=>{
  let i = arr.indexOf(what)
  if (i > -1) {
    arr.splice(i, 1)
  } else {
    arr.push(what)
  }
  return arr
}

const BuildArray = (n,f)=>Array.from({
  length: n
}, f)

// return string with 1st char capitalized
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export {RandBetween, SumDice, Likely, Difficulty, ZeroOne, Hash, BuildArray, SpliceOrPush, DiceArray, WeightedString, capitalize, chance}
