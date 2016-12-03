// This example requires the Google Maps Places and Geometry library.
// Include the libraries=places,geometry
// parameter when you first load the API.
var useLocalDatasources = true;

var logDelaySec = 1500;
var placeQueryDistM = 1200;
var placeRatingThreshold = 3.5;
// Filter out GMap places types we don't care for, see
// https://developers.google.com/places/supported_types
var ignorePlacesTypes = [
	'political', 'food', 'lodging', 'store', 'doctor', 'lawyer', 'atm', 'laundry'
];
var placeNameStripRegex = / GmbH| UG| AG/;
var queryLocation = {
	lat: 52.488529642618275, lng: 13.355426788330078
}
var cityCntr = { lat: 52.506704, lng: 13.390324 }; // Berlin city center

var map;
var infowindow;
var placeMarkers = [];
var placeRRInterval; // Switches the places round robin
var placeRRTimeout; // Does the animation back to the map in between places

/** The main app function, invoked by google maps js as soon as its loaded */
function initMap() {
	alertify.delay(logDelaySec); // Notification log timeout
	map = new google.maps.Map(document.getElementById('map'), {
		center : queryLocation,
		zoom : 15
	});
	infowindow = new google.maps.InfoWindow(); // For showing popups
	var queryLocationLatLng = new google.maps.LatLng(queryLocation.lat, queryLocation.lng);
	
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
		var bounds = new google.maps.LatLngBounds();
		bounds.extend(carLoc);
		bounds.extend(queryLocation);
		map.fitBounds(bounds); // Re-fit the map on the start-destination bounds
		google.maps.event.addListener(marker, 'click', function() {
			infowindow.setContent(chosenCar.value.vehicle.providerName + ': ' + chosenCar.value.vehicle.license);
			infowindow.open(map, this);
		});
		
		map.addListener('click', function(ev) {
			alertify.log('map clicked on ' + ev.latLng.lat().toFixed(3) + ' ' + ev.latLng.lng().toFixed(3));
			queryAndShowDestinations(map, carLoc, ev.latLng);
		});
	});
}

function clearPlaceMarkers() {
	$.each(placeMarkers, function() {
		this.setMap(null);
	});
	placeMarkers.length = 0;
}

/** Query for charging stations and show possible POI destinations */
function queryAndShowDestinations(map, carLocLatLng, queryLocationLatLng) {
	if(placeRRInterval) {
		clearInterval(placeRRInterval);
		placeRRInterval = null;
	}
	if(placeRRTimeout) {
		clearTimeout(placeRRTimeout);
		placeRRTimeout = null;
	}
		
	// Search for charging stations near our query location
	// use the closest charging station to display a route and query
	// for POIs to show on the map
	queryAvailChargingStations(queryLocationLatLng, function cbChrgStations(stationData) {
		// Sort the station data by distance from our queryLocationLatLng
		$.each(stationData, function() {
			var stLatLng = new google.maps.LatLng(this.location.coordinates[1], this.location.coordinates[0]);
			this.dist = google.maps.geometry.spherical.computeDistanceBetween(queryLocationLatLng, stLatLng);
		})
		stationData.sort(function(a, b) { // Sort by shortest distance first
			return a.dist - b.dist;
		});
		// Select the nearest station and calculate bounds for the map
		var dstChrgStn = stationData[0];
		var dstLatLng = new google.maps.LatLng(dstChrgStn.location.coordinates[1], dstChrgStn.location.coordinates[0]);
		alertify.log('nearest station is ' + Math.round(dstChrgStn.dist) + 'm away');
		var bounds = new google.maps.LatLngBounds();
		bounds.extend(carLocLatLng);
		bounds.extend(dstLatLng);
		map.fitBounds(bounds); // Re-fit the map on the start-destination bounds
		// Calculate and display the route to the charging stations
		calcRoute(map, carLocLatLng, dstLatLng);
		// Query and display interesting places around the charging station
		function createMarkers(places) {
			clearPlaceMarkers();
			$.each(places, function(idx, place) {
				var placeLoc = place.geometry.location;
				var marker = new google.maps.Marker({
					map : map,
					position : place.geometry.location
				});
				placeMarkers.push(marker);
				google.maps.event.addListener(marker, 'click', function() {
					infowindow.setContent(place.name + ' rating: ' + place.rating);
					infowindow.open(map, this);
				});
			});
		}

		function showPlacesRoundRobin(places) {
			var placeIdx = 0;
			placeRRInterval = setInterval(function roundRobinPlaces() {
				clearPlaceMarkers();
				if(!$('#map').hasClass('pt-page-current'))
					doPageAnimation($('#poiImage'), $('#map'));
				var place = places[placeIdx];
				var placeName = place.name.replace(placeNameStripRegex, ''); // Remove useless suffixes
				var placeLoc = place.geometry.location;
				var marker = new google.maps.Marker({
					map : map,
					position : placeLoc
				});
				placeMarkers.push(marker);
				map.panTo(placeLoc);
				infowindow.setContent(placeName + ' ' + place.rating + ' ☆');
				infowindow.open(map, marker);
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
				var photoImgPreload;
				if(photoUrl && photoUrl.length > 0) {
					photoImgPreload = new Image();
					photoImgPreload.src = photoUrl;
				}
				placeRRTimeoutOut = setTimeout(function backToMap() {
					$('#poiImage').css('background-image', 'url(' + photoUrl + ')');
					$('#poiTitle').text(placeName);
					$('#poiIcon').attr('src', place.icon);
					doPageAnimation($('#map'), $('#poiImage'));
				}, 3000);
				placeIdx++; // Round robin fashion
				if(placeIdx >= places.length)
					placeIdx = 0;
			}, 6000);

		}
//		queryPlaces(map, dstLatLng, createMarkers);
		queryPlaces(map, dstLatLng, showPlacesRoundRobin);
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
		if (status !== google.maps.places.PlacesServiceStatus.OK) {
			console.log('got status ' + status + ' for detail place search');
		}
		dtlPlaces.push(place);
		if(dtlPlaces.length === dtlReqPlaces.length) { // See if we are done
			dtlPlaces = dtlPlaces.sort(function(a, b) { // Sort by rating, remove places without one
				return (!a ? 0 : a.rating) - (!b ? 0 : b.rating);
			}).filter(function(p) {
				return (p != null && p.rating > placeRatingThreshold) ? true : false;
			});
			alertify.log('found ' + dtlPlaces.length + ' places');
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
				if(ignore) {
					console.log('Ignoring ' + place.name + ' types: ' + JSON.stringify(place.types));
					continue;
				}
				var dtlReq = {
					placeId: place.place_id,
				};
				console.log('place ' + place.name + ' types: ' + JSON.stringify(place.types));
				dtlReqPlaces.push(place);
				service.getDetails(dtlReq, cbDtlSrch);
			}
		}
	}
	
	service.nearbySearch({
		location : latLng,
		radius : placeQueryDistM,
		// Only one type is used
		// type: 'store',
//		type : 'point_of_interest',
		// Deprecated, but essential, otherwise the results are shit
		types: ['amusement_park', 'aquarium', 'art_gallery', 'movie_theater', 'museum', 'city_hall', 'shopping_mall', 'stadium', 'university', 'zoo'],
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
		console.log('found ' + data.length + ' charging stations ', data);
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
