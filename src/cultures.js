const randColor = (PRNG) => {
    let h = PRNG.randBetween(0,360);  // Hue
    let s = PRNG.randBetween(30,100); //saturation, avoiding very pale 
    let l = PRNG.randBetween(20,80); // lightness, avoiding very light/dark 

    //convert to hex 
    return _.hslToHex(h,s,l);
}

/*
    Create cultures for a galaxy based upon the simple Game of Life algorithm
*/

const NEIGHBORS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

//random walk to claim 
const Walk = (c, id, n, PRNG) => {
    let _next = c.claim(id);
    for (let i = 1; i < n; i++) {
        _next = PRNG.pickone(c.neighbors);
        _next.claim(id);
    }
}

//Cell = Sector 
class Cell {
    constructor(manager, x, y, state = 0) {
        this.m = manager;
        this.x = x;
        this.y = y;
        this.state = state;  // 0 dead, 1 alive

        //claim history
        this._claims = [];
    }
    get neighbors() {
        let c = this.m._cells;
        let n = NEIGHBORS.map(p => c.get([this.x + p[0], this.y + p[1]].join()));
        return n.filter(_n => typeof _n !== "undefined");
    }
    get nAlive() {
        return this.neighbors.filter(n => n && n.state == 1);
    }
    get claims () {
        return this._claims.map(id => this.m.cultures[id]);
    }
    claim(id) {
        //make claim 
        this._claims[0] != id ? this._claims.unshift(id) : null;
        //alive
        this.state = 1;
    }
}

//Manages the Cultures and steping through generations of life 
export class Cultures {
    constructor(seed, R, birth = 77, steps = 33) {
        this.seed = seed;
        this.r = R / 1000;
        //set of all viable 
        this._cells = new Map();
        //track number of cultures - array is the step that they were created  
        this._cultures = [];
        this._lastAct = [];
        this._colors = [];
        //track number of steps in era 
        this._steps = 0;

        //init and start first era
        this.init();
        this.random(birth);
        for (let i = 0; i < steps; i++) {
            this.step();
        }
    }

    get countCells() {
        return this._cells.size;
    }

    get inhabited () {
        return [...this._cells.values()].filter(c => c._claims.length > 0);
    }

    get alive() {
        return [...this._cells.values()].filter(c => c.state == 1);
    }

    get cultures() {
        let _cultures = {};
        [...this._cells.values()].forEach(c => {
            //only if claimed
            c._claims.forEach((cid, i) => {
                //create culture object or push cell 
                if (_cultures[cid]) {
                    _cultures[cid].cells.push(c)
                } else {
                    _cultures[cid] = {
                        id: cid,
                        init : this._cultures[cid],
                        lastAct : this._lastAct[cid],
                        color: this._colors[cid],
                        cells: [c],
                        //helper function to determine if culture is active/alive
                        get isAlive() {
                            return this.active.length > 0
                        },
                        get active() {
                            return this.cells.filter(_c => _c.state == 1 && _c._claims[0] == cid)
                        }
                    }
                }
            })
        });

        return Object.values(_cultures).sort((a,b)=> a.id-b.id);
    }

    init() {
        let r = this.r;
        //push ids 
        for (let x = -r; x < r; x++) {
            for (let y = -r; y < r; y++) {
                let _r2 = x * x + y * y;
                //create a new cell if distance less than r 
                _r2 < r * r ? this._cells.set([x, y].join(), new Cell(this, x, y)) : null;
            }
        }
    }

    //random fill of galaxy cultures 
    random(nc, seed = 0) {
        let _id = [this.seed, this._steps, seed];
        let PRNG = new Chance(_id.join("."));

        //how many cells to fill 
        let _cells = [...this._cells.values()];
        let _nc = PRNG.d6() + 3;
        nc = nc || _nc;

        //get cells and do a walk 
        for (let i = 0; i < nc; i++) {
            //birth of culture 
            let cid = this._cultures.length;
            this._cultures.push(this._steps);
            this._lastAct[cid] = this._steps;
            this._colors.push(randColor(PRNG));
            //get cell
            let _c = PRNG.pickone(_cells);
            //walk to claim 
            Walk(_c, cid, PRNG.weighted([1, 2, 3, 4, 5], [20, 25, 35, 15, 5]), PRNG);
        }
    }

    /*
          Step through a generation of growth
    	
      * A live cell that has less than 2 neighbours dies of loneliness.
          * A live cell that has 2 or 3 neighbours survives to the next generation.
          * A live cell that has more than 3 neighbours dies of overpopulation.
          * A dead cell that has exactly 3 living neighbours becomes alive as if by reproduction.
    */
    step() {
        this._cells.forEach((c, id) => {
            let n = c.nAlive;
            let cn = n.length;

            if (c.state == 1) {
                //keep alive 
                c.state = cn > 3 ? 0 : cn < 2 ? 0 : 1;
            }
            else if (cn == 3) {
                let _id = n[0]._claims[0];
                //claim the cell -  
                c.claim(_id);
                //mark active
                this._lastAct[_id] = this._steps;
            }
        });

        this._steps++;

        //fill with newly birthed cultures
        this.random();
    }

    //display 
    draw() {
        let r = this.r;
        //get SVG
        let svg = SVG('svg');
        svg.clear();

        [...this._cells.values()].forEach(c => {
            let _color = this._colors[c._claims[0]];
            if (c.state == 0 && c._claims.length > 0) {
                let rect = svg.rect(10, 10).fill(_color).move((c.x + r) * 10, (c.y + r) * 10);
                rect.addClass('quiet');
            }
            else if (c.state == 1) {
                let rect = svg.rect(10, 10).fill(_color).move((c.x + r) * 10, (c.y + r) * 10);
            }

        })
    }
}
