// This example requires the Google Maps Places library.
// Include the libraries=places 
// parameter when you first load the API.

var map;
var infowindow;

// Filter out types we don't care for, see
// https://developers.google.com/places/supported_types
var ignorePlacesTypes = [
	'food', 'lodging', 'store', 'doctor', 'lawyer'
];
var startLocation = { // Schaubühne Berlin
	lat : 52.498478,
	lng : 13.303511
};

function initMap() {
	map = new google.maps.Map(document.getElementById('map'), {
		center : startLocation,
		zoom : 15
	});
	infowindow = new google.maps.InfoWindow();
	var queryLocation = new google.maps.LatLng(52.488529642618275, 13.355426788330078);
	queryChargingStations(queryLocation, function cbChrgStations(stationData) {
		// Sort the station data by distance from our queryLocation
		$.each(stationData, function() {
			var stLatLng = new google.maps.LatLng(this.location.coordinates[1], this.location.coordinates[0]);
			this.dist = google.maps.geometry.spherical.computeDistanceBetween(queryLocation, stLatLng);
		})
		stationData.sort(function(a, b) {
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
		calcRoute(map, dstLatLng);
		// Query and display interesting places around the charging station
		queryPlaces(map, dstLatLng);
	});
}

function queryPlaces(map, latLng) {
	var service = new google.maps.places.PlacesService(map);
	var dtlReqPlaces = []; // Places we requested details for, to detect when we are done with all the requests
	var dtlPlaces = []; // The results of the detail queries
	function createMarkers(places) {
		$.each(places, function(idx, place){
			var placeLoc = place.geometry.location;
			var marker = new google.maps.Marker({
				map : map,
				position : place.geometry.location
			});
			google.maps.event.addListener(marker, 'click', function() {
				infowindow.setContent(place.name + ' rating: ' + place.rating);
				infowindow.open(map, this);
			});
		})
	}
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
			}).filter(function() { return this.rating ? true : false; });
			createMarkers(dtlPlaces);
		}
	}
	function cbNbSrch(results, status) {
		if (status === google.maps.places.PlacesServiceStatus.OK) {
			for (var i = 0; i < results.length; i++) {
				var place = results[i];
				if(!place.photos || !place.photos.length)
					continue; // We only need places with photos
				var ignore = false;
				// Filter our irrelevant places
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

//function calcDirections() {
//	directionsDisplay = new google.maps.DirectionsRenderer();
//	var chicago = new google.maps.LatLng(41.850033, -87.6500523);
//	var mapOptions = {
//		zoom:7,
//		center: chicago
//	}
//	map = new google.maps.Map(document.getElementById('map'), mapOptions);
//	directionsDisplay.setMap(map);
//}

function calcRoute(map, destLatLng) {
	directionsService = directionsService ? directionsService : new google.maps.DirectionsService();
	directionsDisplay = directionsDisplay ? directionsDisplay : new google.maps.DirectionsRenderer();
	directionsDisplay.setMap(map);
	
	var start = startLocation.lat + ', ' + startLocation.lng;
	var end = destLatLng.lat() + ', ' + destLatLng.lng();
	var request = {
		origin: start,
		destination: end,
		travelMode: 'DRIVING'
	};
	directionsService.route(request, function(result, status) {
		if (status == 'OK') {
//			var opts = { polylineOptions: {strokeColor: '#47d447'} };
//			directionsDisplay2.setOptions(opts);
			directionsDisplay.setDirections(result);
			console.log('directions', result);
			var route = result.routes[0];
			var leg = route.legs[0];
			console.log('distance ' + leg.distance.text + ' driving time: ' + leg.duration.text);
		}
	});
}

function queryChargingStations(latLng, cbAvailStations) {
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
