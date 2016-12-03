// This example requires the Google Maps Places and Geometry library.
// Include the libraries=places,geometry
// parameter when you first load the API.
var useLocalDatasources = true;

var map;
var infowindow;

// TODO s
// * Chose the farthest carsharing car as the start location
// * Assign useful icons for specific locations

// Filter out GMap places types we don't care for, see
// https://developers.google.com/places/supported_types
var ignorePlacesTypes = [
	'food', 'lodging', 'store', 'doctor', 'lawyer'
];
var startLocation = { // Beusselstr
	lat : 52.534350,
	lng : 13.328834
};
var cityCntr = { lat: 52.506704, lng: 13.390324 }; // Berlin city center

/** The main app function, invoked by google maps js as soon as its loaded */
function initMap() {
	map = new google.maps.Map(document.getElementById('map'), {
		center : startLocation,
		zoom : 15
	});
	infowindow = new google.maps.InfoWindow(); // For showing popups
	var queryLocation = new google.maps.LatLng(52.488529642618275, 13.355426788330078);

	// Search for the farthest carsharing car from the city center
	queryCarsharing(function cbAvailCars(cars) {
		var cityCntrLatLng = new google.maps.LatLng(cityCntr.lat, cityCntr.lng);
		// Sort the station data by distance from the city center
		$.each(cars, function() {
			var carLatLng = new google.maps.LatLng(this.location.latitude, this.location.longitude);
			this.dist = google.maps.geometry.spherical.computeDistanceBetween(cityCntrLatLng, carLatLng);
		});
		cars.sort(function(a, b) { // Sort by largest distance first
			return b.dist - a.dist;
		});
		var chosenCar = cars[0];
//		var carLoc = new google.maps.LatLng(chosenCar.location.latitude, chosenCar.location.longitude);
		var carLoc = new google.maps.LatLng(chosenCar.location.latitude, chosenCar.location.longitude);
		var marker = new google.maps.Marker({
			map : map,
			position : carLoc
		});
		google.maps.event.addListener(marker, 'click', function() {
			infowindow.setContent(chosenCar.value.vehicle.providerName + ': ' + chosenCar.value.vehicle.license);
			infowindow.open(map, this);
		});
		
		// Search for charging stations near our query location
		// use the closest charging station to display a route and query
		// for POIs to show on the map
		queryAvailChargingStations(queryLocation, function cbChrgStations(stationData) {
			// Sort the station data by distance from our queryLocation
			$.each(stationData, function() {
				var stLatLng = new google.maps.LatLng(this.location.coordinates[1], this.location.coordinates[0]);
				this.dist = google.maps.geometry.spherical.computeDistanceBetween(queryLocation, stLatLng);
			})
			stationData.sort(function(a, b) { // Sort by shortest distance first
				return a.dist - b.dist;
			});
			// Select the nearest station and calculate bounds for the map
			var dstChrgStn = stationData[0];
			var dstLatLng = new google.maps.LatLng(dstChrgStn.location.coordinates[1], dstChrgStn.location.coordinates[0]);
			var bounds = new google.maps.LatLngBounds();
			bounds.extend(new google.maps.LatLng(startLocation.lat, startLocation.lng));
			bounds.extend(dstLatLng);
			map.fitBounds(bounds); // Re-fit the map on the start-destination bounds
			// Calculate and display the route to the charging stations
			calcRoute(map, carLoc, dstLatLng);
			// Query and display interesting places around the charging station
			function createMarkers(places) {
				$.each(places, function(idx, place) {
					var placeLoc = place.geometry.location;
					var marker = new google.maps.Marker({
						map : map,
						position : place.geometry.location
					});
					google.maps.event.addListener(marker, 'click', function() {
						infowindow.setContent(place.name + ' rating: ' + place.rating);
						infowindow.open(map, this);
					});
				});
			}

			function showPlacesRoundRobin(places) {
				var placeIdx = 0;
				setInterval(function roundRobinPlaces() {
					var place = places[placeIdx];
					var placeLoc = place.geometry.location;
					var marker = new google.maps.Marker({
						map : map,
						position : place.geometry.location
					});
					var photoUrl = '';
					var photoDim = {'maxWidth': 1280, 'maxHeight': 720};
					if(place.photos && place.photos.length) {
						var minPixelWidth = 400;
						$.each(place.photos, function(idx) {
							if(this.width >= minPixelWidth) {
								photoUrl = this.getUrl(photoDim);
								return false; // break
							}
						});
					}
					$('#poiImage').css('background-image', 'url(' + photoUrl + ')');
					$('#poiTitle').text(place.name.replace(/ GmbH| UG| AG/, '')); // Remove useless suffixes
					$('#poiIcon').attr('src', place.icon);
					doPageAnimation($('#map'), $('#poiImage'));
					
					setTimeout(function backToMap() {
						doPageAnimation($('#poiImage'), $('#map'));
					}, 3000);
					placeIdx++; // Round robin fashion
					if(placeIdx >= places.length)
						placeIdx = 0;
				}, 4000);

			}
//			queryPlaces(map, dstLatLng, createMarkers);
			queryPlaces(map, dstLatLng, showPlacesRoundRobin);
		});
	});
}

/** Show a nice page in/out animation */
function doPageAnimation($currPage, $nextPage) {
	var animEndEventNames = {
		'WebkitAnimation' : 'webkitAnimationEnd',
		'OAnimation' : 'oAnimationEnd',
		'msAnimation' : 'MSAnimationEnd',
		'animation' : 'animationend'
	};
	// animation end event name
	var animEndEventName = animEndEventNames[ Modernizr.prefixed( 'animation' ) ];
	var currPageClass = 'pt-page-current';
	var outClass = 'pt-page-moveToTopFade';
	var inClass = 'pt-page-moveFromBottomFade';
	$currPage.addClass( outClass ).on( animEndEventName, function() {
		$currPage.off( animEndEventName );
		$currPage.removeClass(outClass + ' ' + currPageClass);
	} );
	$nextPage.addClass( inClass + ' ' + currPageClass ).on( animEndEventName, function() {
		$nextPage.off( animEndEventName );
		$nextPage.removeClass(inClass);
	} );
}

/** Queries GMaps for nearby places, filtering them and fetches their details,
 * then draws them on the map */
function queryPlaces(map, latLng, cbBestPlaces) {
	var service = new google.maps.places.PlacesService(map);
	var dtlReqPlaces = []; // Places we requested details for, to detect when we are done with all the requests
	var dtlPlaces = []; // The results of the detail queries

	/** Callback for detailed places search, as soon as all results have been fetched */
	function cbDtlSrch(place, status) {
		dtlPlaces.push(place);
		if (status == google.maps.places.PlacesServiceStatus.OK) {
			if(place.rating) { // Only places with ratings
				var photoDim = {'maxWidth': 400, 'maxHeight': 400};
				var photoUrl = (place.photos && place.photos.length) ? place.photos[0].getUrl(photoDim) : '';
				console.log(place, place.name, photoUrl);
			}
		}
		if(dtlPlaces.length === dtlReqPlaces.length) { // See if we are done
			dtlPlaces.sort(function(a, b) { // Sort by rating, remove places without one
				return a.rating - b.rating;
			}).filter(function() {
				return this.rating > 3.9 ? true : false;
			});
			cbBestPlaces(dtlPlaces);
		}
	}
	/** Callback for nearby places search */
	function cbNbSrch(results, status) {
		if (status === google.maps.places.PlacesServiceStatus.OK) {
			for (var i = 0; i < results.length; i++) {
				var place = results[i];
				if(!place.photos || !place.photos.length)
					continue; // We only need places with photos
				var ignore = false;
				// Filter our irrelevant places, by type blacklist
				for(var j = 0; j < ignorePlacesTypes.length; j++) {
					if(place.types.indexOf(ignorePlacesTypes[j]) !== -1) {
						ignore = true;
						break;
					}
				}
				if(ignore)
					continue;
				var dtlReq = {
					placeId: place.place_id,
				};
				dtlReqPlaces.push(place);
				service.getDetails(dtlReq, cbDtlSrch);
			}
		}
	}
	
	service.nearbySearch({
		location : latLng,
		radius : 500,
		// Only one type is used
		// type: 'store',
		type : 'point_of_interest',
		rankBy : google.maps.places.RankBy.PROMINENCE,
	}, cbNbSrch);
}



// Directions query
var directionsDisplay;
var directionsService;

/** Calculates and displays the route from startLocation to the given destination */
function calcRoute(map, strtLatLng, destLatLng) {
	directionsService = directionsService ? directionsService : new google.maps.DirectionsService();
	directionsDisplay = directionsDisplay ? directionsDisplay : new google.maps.DirectionsRenderer();
	directionsDisplay.setMap(map);
	
	var start = strtLatLng.lat() + ', ' + strtLatLng.lng();
	var end = destLatLng.lat() + ', ' + destLatLng.lng();
	var request = {
		origin: start,
		destination: end,
		travelMode: 'DRIVING'
	};
	directionsService.route(request, function(result, status) {
		if (status == 'OK') {
//			var opts = { polylineOptions: {strokeColor: '#47d447'} };
//			directionsDisplay.setOptions(opts);
			directionsDisplay.setDirections(result);
			console.log('directions', result);
			var route = result.routes[0];
			var leg = route.legs[0];
			console.log('distance ' + leg.distance.text + ' driving time: ' + leg.duration.text);
			$('#distTime').text((Math.round(leg.duration.value / 60)).toFixed(0));
		}
	});
}

/** Queries the charging infrastructure service from http://www.be-emobil.de/ladestationen/ for charging stations */
function queryAvailChargingStations(latLng, cbAvailStations) {
	var chrgApiUrl = 'https://api.charging-infrastructure.viz.berlin/lbs';
	var allStations = [];
	var availStations = [];
	$.get(chrgApiUrl + '/Resources/EVCharging/Stations?lat=' + latLng.lat() + '&lng=' + latLng.lng() + '&radius=4500', function( data ) {
		console.log(data);
		$.each(data, function() {
			$.get(chrgApiUrl + this.uri, function(stationData) {
				allStations.push(stationData);
				if(stationData.dispenserFree > 0)
					availStations.push(stationData);
				if(allStations.length === data.length)
					cbAvailStations(availStations);
			});
		});
	});
}

/** Queries the available charsharing cars from Multicity */
function queryCarsharing(cbAvailCars) {
	function dataCb(data) {
		data = data.query.results.json.json;
		cbAvailCars(data);
	}
	if(useLocalDatasources) {
		$.getJSON("cached-data/multicity.json", dataCb);
		return;
	}
	var crshrgUrl = 'https://www.multicity-carsharing.de/_denker-mc.php';
	// Need to use a proxy, as there are no Cors headers on the original HTTP
	$.getJSON("http://query.yahooapis.com/v1/public/yql",{
			q: 'select * from json where url="' + crshrgUrl + '"',
			format: "json"
	}, dataCb);
}
