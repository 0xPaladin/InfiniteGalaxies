const ERAS = ["Heralds", "Frontier", "Firewall", "ExFrame", "Wanderer"]

/*
	UI Tempaltes
*/
_.UISelect = function(data, val, f, css="") {
  return _.html`
	<select class=${css} value=${val} onChange=${f}>
        ${data.map(o=>_.html`<option value=${o}>${Array.isArray(o) ? o[0] : o}</option>`)}
    </select>`
}

_.UIDropdown = function(button,css="") {
  return _.html`
	<div class="dropdown ${css}" style="direction: ltr;">
		<div class="f4 tc pointer dim underline-hover hover-blue bg-white db pa2 ba br2">${button}</div>
		<div class="dropdown-content w-100 bg-white ba bw1 pa1">
			${filters.map(sf=>html`
			<div class="link pointer underline-hover" onClick=${()=>app.refresh(this._filter = sf)}>${sf}</div>`)}
		</div>
	</div>`
}

/*
  UI Resources  
*/

const Main = (app)=>{
  const {html} = app

  return html`
  <div class="flex flex-column justify-center m-auto mw6">
    <div class="f3 tc link pointer dim underline-hover hover-orange bg-white-70 db br2 mv1 pa2" onClick=${()=>app.show = "Start"}><i>Start</i></div>
  </div>
  `
}

const Galaxy = (app)=>{
  let html = app.html
  let {tick} = app.state
  let G = app.galaxy || {}
  let {time=[30], show={}, _show="Galaxy", _era="Wanderer"} = G
  let period = time[0]
  let {left="", right="", header=""} = show

  return ''
}

const GalaxyFactionUI = (app)=>{
  return app.galaxy.Faction.UI.dialog
}

const StartGame = (app)=>{
  return app.galaxy.Faction.UI.dialog
}

const D = {
  Main,
  GalaxyFactionUI
}
const Dialog = (app)=>{
  let[what,id,ui] = app.state.dialog.split(".")

  return app.html`
  <div class="fixed z-2 top-1 left-1 bottom-1 right-1 flex items-center justify-center">
    <div class="overflow-y-auto o-90 bg-washed-blue br3 shadow-5 pa2" style="max-height:75vh;">
      ${app[what] ? app[what][id][ui] : D[what] ? D[what](app) : ""}
    </div>
  </div>`
}

export {Main, Dialog, Galaxy}
