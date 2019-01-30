var fs = require('fs');
var express = require('express');
var cron = require('node-cron');

var router = express.Router();

const Gpio = require('orange-pi-gpio');

let gpio = [ 
    new Gpio({pin:0, mode: 'out', ready: ready}),
    new Gpio({pin:21, mode: 'out', ready: ready}),
    new Gpio({pin:2, mode: 'out', ready: ready}),
    new Gpio({pin:3, mode: 'out', ready: ready}),
    new Gpio({pin:4, mode: 'out', ready: ready}),
    new Gpio({pin:5, mode: 'out', ready: ready}),
    new Gpio({pin:6, mode: 'out', ready: ready}),
    new Gpio({pin:7, mode: 'out', ready: ready})
];

let DEFULT_SCHEDULE = [
    { status: "off", day: ["13:00-13:01","13:03-13:05"] }, /* GPIO 0 */
    { status: "off", day: [] }, /* GPIO 1 */
    { status: "off", day: [] }, /* GPIO 2 */
    { status: "off", day: [] }, /* GPIO 3 */
    { status: "off", day: [] }, /* GPIO 4 */
    { status: "off", day: [] }, /* GPIO 5 */
    { status: "off", day: [] }, /* GPIO 6 */
    { status: "off", day: [] }, /* GPIO 7 */
];

schedule = [];

let ready_count = 0;
let all_ready = false;

function ready()
{
	ready_count++;
	if( ready_count < gpio.length )
	{
		console.log( "Waiting for GPIOs to be ready %s", ready_count );
		return;
	}

	// BJ: initializing GPIOs + schedule
    fs.readFile( "./schedule.json", ( err, data ) =>
    {
		if( err )
		    return console.log( "FAILED TO READ SCHEDULE.JSON ERR-%s", err.message );

		try
        {
            schedule = JSON.parse( data.toString() );
        }
        catch( err )
        {
            console.log( "ERROR PARSING SCHEDULE.JSON ERR-%s", err.message );
            console.log( "DEFAULT SCHEDULE USED" );

            schedule = DEFULT_SCHEDULE;
        }

        console.log( "SCHEDULE:" );
        for( let i = 0 ; i < schedule.length ; i++ )
            console.log( schedule[ i ] );

        console.log( "RESETTING GPIO's" );
        for( let i = 0 ; i < gpio.length ; i++ )
            gpio[i].write( 0 );

        all_ready = true;
    });

}

cron.schedule('* * * * *', () =>
{
    if( !all_ready )
        console.log( 'Not Ready Yet!');

    let now = new Date();
    schedule.forEach( ( entry, i ) =>
    {
        if( entry.status == "on" )
        {
            let on = 0;

            entry.day.forEach( ( sch ) =>
            {
                if( on )
                    return;

                let time_range = sch.split("-");

                if( time_range.length != 2 )
                    return;

                let from = new Date( now.getFullYear(), now.getMonth(), now.getDate(), time_range[0].split(":")[0], time_range[0].split(":")[1] );
                let to = new Date( now.getFullYear(), now.getMonth(), now.getDate(), time_range[1].split(":")[0], time_range[1].split(":")[1] );

                if( now >= from && now <= to )
                    on = 1;
                console.log( "GPIO: %s, [%s-%s] => ", i, from.toLocaleString().split(", ")[1], to.toLocaleString().split(", ")[1], on );
            });
            gpio[i].write( on );
        }
    } );
});

/* GET home page. */
router.get('/set', function(req, res, next)
{
	if( ready_count != gpio.length )
		return res.json( { result: "failed", error: "not ready" } );
	
	let pin = isNaN( Number( req.query.pin ) ) ? null : Number( req.query.pin );
	let action = req.query.action || null;
	if( pin === null  || pin < 0 || pin >= gpio.length ||
	    ( action !== "on" && action !== "off" ) )
		return res.json( { result: "failed", error: "invalid parameters", pin, action } );
		
	gpio[pin].write( action == "on" ? 1 : 0 );
	res.json ( { result: "success", pin, action } );
});

router.get('/schedule', function(req, res, next)
{
    if( ready_count != gpio.length )
        return res.json( { result: "failed", error: "not ready" } );

    let pin = isNaN( Number( req.query.pin ) ) ? null : Number( req.query.pin );
    let action = req.query.action || null;
    let day = req.query.day || null;
    if( pin === null  || pin < 0 || pin >= gpio.length ||
        ( action !== "on" && action !== "off" ))
        return res.json( { result: "failed", error: "invalid parameters", pin, action } );

    schedule[pin].status = action;
    if( day )
        schedule[pin].day = day.split(",").filter( ( val ) => val.indexOf("-") != -1 );

    fs.writeFile( "./schedule.json", JSON.stringify( schedule ), ( err ) =>
    {
        if( err )
            return res.json ( { result: "failed", error: "Write schedule.json error-" + err.message , pin, action, day} );

        res.json ( { result: "success", pin, action, day } );

    })
});

router.get('/status', async function(req, res, next) 
{
	if( ready_count != gpio.length )
		return res.json( { result: "failed", error: "not ready" } );
	
	let result = [];
	for( let i = 0 ; i < gpio.length ; i++ )
	{
        result[i] = { value: ( await gpio[i].read() ) == 1 ? "on" : "off", schedule_status: schedule[i].status, schedule_day: schedule[i].day };
	}
	
	res.json( result );
});

module.exports = router;
