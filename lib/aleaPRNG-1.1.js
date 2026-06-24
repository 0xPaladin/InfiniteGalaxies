// Alea PRNG with good statistical properties — seeded, deterministic, fast
function aleaPRNG() {
    return( function( args ) {
        "use strict";

        const version = 'aleaPRNG 1.1.0';

        var s0
            , s1
            , s2
            , c
            , uinta = new Uint32Array( 3 )
            , initialArgs
            , mashver = ''
        ;

        function _initState( _internalSeed ) {
            var mash = Mash();

            s0 = mash( ' ' );
            s1 = mash( ' ' );
            s2 = mash( ' ' );

            c = 1;

            for( var i = 0; i < _internalSeed.length; i++ ) {
                s0 -= mash( _internalSeed[ i ] );
                if( s0 < 0 ) { s0 += 1; }

                s1 -= mash( _internalSeed[ i ] );
                if( s1 < 0 ) { s1 += 1; }
                
                s2 -= mash( _internalSeed[ i ] );
                if( s2 < 0 ) { s2 += 1; }
            }

            mashver = mash.version;

            mash = null;
        };

        function Mash() {
            var n = 4022871197;

            var mash = function( data ) {
                data = data.toString();
                
                for( var i = 0, l = data.length; i < l; i++ ) {
                    n += data.charCodeAt( i );
                    
                    var h = 0.02519603282416938 * n;
                    
                    n  = h >>> 0;
                    h -= n;
                    h *= n;
                    n  = h >>> 0;
                    h -= n;
                    n += h * 4294967296;
                }
                return ( n >>> 0 ) * 2.3283064365386963e-10;
            };

            mash.version = 'Mash 0.9';
            return mash;
        };


        function _isInteger( _int ) { 
            return parseInt( _int, 10 ) === _int; 
        };

        var random = function() {
            var t = 2091639 * s0 + c * 2.3283064365386963e-10;
            
            s0 = s1;
            s1 = s2;

            return s2 = t - ( c = t | 0 );
        };

        random.fract53 = function() {
            return random() + ( random() * 0x200000  | 0 ) * 1.1102230246251565e-16;
        };

        random.int32 = function() {
            return random() * 0x100000000;
        };

        random.cycle = function( _run ) {
            _run = typeof _run === 'undefined' ? 1 : +_run;
            if( _run < 1 ) { _run = 1; }
            for( var i = 0; i < _run; i++ ) { random(); }
        };

        random.range = function() { 
            var loBound
                , hiBound
            ;
            
            if( arguments.length === 1 ) {
                loBound = 0;
                hiBound = arguments[ 0 ];

            } else {
                loBound = arguments[ 0 ];
                hiBound = arguments[ 1 ];
            }

            if( arguments[ 0 ] > arguments[ 1 ] ) { 
                loBound = arguments[ 1 ];
                hiBound = arguments[ 0 ];
            }

            if( _isInteger( loBound ) && _isInteger( hiBound ) ) { 
                return Math.floor( random() * ( hiBound - loBound + 1 ) ) + loBound; 

            } else {
                return random() * ( hiBound - loBound ) + loBound; 
            }
        };

        random.restart = function() {
            _initState( initialArgs );
        };

        random.seed = function() { 
            _initState( Array.prototype.slice.call( arguments ) );
        }; 

        random.version = function() { 
            return version;
        }; 

        random.versions = function() { 
            return version + ', ' + mashver;
        }; 

        if( args.length === 0 ) {
             window.crypto.getRandomValues( uinta );
             args = [ uinta[ 0 ], uinta[ 1 ], uinta[ 2 ] ];
        };

        initialArgs = args;

        _initState( args );

        return random;

    })( Array.prototype.slice.call( arguments ) );
};

export default aleaPRNG;
