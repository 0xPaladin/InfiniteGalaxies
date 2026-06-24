(function() {
  const _ = {}

  //hsl to hex
  _.hslToHex = function (h,s,l) {
    l /= 100;
    const a = s * Math.min(l,1-l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2,'0'); // convert to Hex an prefix with 0 if needed
    } 
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  //Simple roman numeral conversion 
  _.romanNumeral = function(n) {
    var units = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX","X"];

    if (n < 0 || n >= 20) {
      return n;
    } else if (n > 10) {
      return "X" + this.romanNumeral(n - 10);
    } else {
      return units[n];
    }
  }

  //Simple roman numeral conversion 
  _.suffix = function(_n) {
    let n = _n % 10

    if (_n <= 0) {
      return n;
    } else if (_n > 3 && _n < 20) {
      return _n + 'th';
    } else {
      return _n + ['st', 'nd', 'rd'][n - 1];
    }
  }

  /*
  Array mixins 
*/
  // functional sum
  _.sum = function(arr) {
    return arr.reduce((s,v)=>s += v, 0);
  }

  //build array from umber from 
  _.fromN = function(n, f) {
    return Array.from({
      length: n
    }, (v,i)=>f(i));
  }

  // capitalizes first character of a string
  _.capitalize = function(str) {
    if (this) {
      return str.substr(0, 1).toUpperCase() + str.substr(1);
    } else {
      return '';
    }
  }
  ;
  // standard clamp function -- clamps a value into a range
  _.clamp = function(a, min, max) {
    return a < min ? min : (a > max ? max : a);
  }
  ;

  // linear interpolation from a to b by parameter t
  _.lerp = function(a, b, t) {
    return a * (1 - t) + b * t;
  }
  ;

  /*
    Object helpers
  */
  _.fromEntries = function (arr) {
    return Object.fromEntries(arr)
  }

  // If there is a window object, that at least has a document property,
  // instantiate and define chance on the window
  if (typeof window === "object" && typeof window.document === "object") {
    window._ = _;
  }
}
)();
