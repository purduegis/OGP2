/**

 * This javascript module includes functions for dealing with the map Div
 * defined under the object MapController.  MapController inherits from
 * the OpenLayers.Map object
 * 
 * @author Chris Barnett
 */

if (typeof OpenGeoportal == 'undefined'){
	OpenGeoportal = {};
} else if (typeof OpenGeoportal != "object"){
	throw new Error("OpenGeoportal already exists and is not an object");
}

//some code to test presence of OpenLayers, check version?

//MapDiv Constructor
OpenGeoportal.MapController = function() {	

	this.previewed = OpenGeoportal.ogp.appState.get("previewed");
	this.template = OpenGeoportal.ogp.appState.get("template");
		
	var analytics = new OpenGeoportal.Analytics();
		

	this.createMap = function(containerDiv, userOptions){
		//set default for the name of the map div
		if ((typeof containerDiv == 'undefined')||(containerDiv.length == 0)){
			throw new Error("The id of the map div must be specified.");
		}
		this.containerDiv = containerDiv;
		this.createMapHtml(containerDiv);
		
		try {
			this.createOLMap(userOptions);
		} catch (e){
			console.log("problem creating ol map");
			console.log(e);
		}
		
		this.initMap();

		try {
		this.registerMapEvents();
		} catch (e){
			console.log("problem registering map events");
			console.log(e);
		}
	};

	this.createMapHtml = function(div){
		//test for uniqueness
		var div$ = jQuery("#" + div);
		if (div$.length == 0){
			throw new Error("The DIV [" + div + "] does not exist!");
		}
		var resultsHTML = this.template.map({mapId: div});
		div$.html(resultsHTML);
	};
	
	this.createDefaultOLPanel = function(nav){

		var zoomBox = new OpenLayers.Control.ZoomBox(
				{title:"Click or draw rectangle on map to zoom in"});
		var that = this;
		var zoomBoxListener = function(){
				jQuery('.olMap').css('cursor', "-moz-zoom-in");
				that.previewed.clearGetFeature();
			};
		zoomBox.events.register("activate", this, zoomBoxListener);
		var panListener = function(){
				jQuery('.olMap').css('cursor', "-moz-grab");
				that.previewed.clearGetFeature();
			};
		var panHand = new OpenLayers.Control.Navigation(
				{title:"Pan by dragging the map"});
		panHand.events.register("activate", this, panListener);
		var globalExtent = new OpenLayers.Control.ZoomToMaxExtent({title:"Zoom to global extent"});
		var panel = new OpenLayers.Control.Panel({defaultControl: panHand});

		panel.addControls([
		                   globalExtent,
		                   nav.previous,
		                   nav.next,
		                   zoomBox,
		                   panHand
		                   ]);
		//display mouse coords in lon-lat
		
		return panel;
	};
	
	this.createOLMap = function(userOptions){
		//set default OpenLayers map options
		this.mapDiv = this.containerDiv + "OLMap";

		var displayCoords = new OpenLayers.Control.MousePosition({displayProjection: new OpenLayers.Projection("EPSG:4326")});

		var mapBounds = new OpenLayers.Bounds(-20037508.34,-20037508.34,20037508.34,20037508.34);
	
		var initialZoom = 1;
		//console.log(jQuery('#' + this.containerDiv));
		if (jQuery('#' + this.containerDiv).parent().height() > 810){
			initialZoom = 2;
			//TODO: this should be more sophisticated.  width is also important
			//initialZoom = Math.ceil(Math.sqrt(Math.ceil(jQuery('#' + this.containerDiv).parent().height() / 256)));
		}
		//console.log(initialZoom);
		var nav = new OpenLayers.Control.NavigationHistory({nextOptions: {title: "Zoom to next geographic extent"}, 
			previousOptions:{title: "Zoom to previous geographic extent"}});
		
		var options = {
				allOverlays: true,
				projection: new OpenLayers.Projection("EPSG:900913"),
				maxResolution: 2.8125,
				maxExtent: mapBounds,
				units: "m",
				zoom: initialZoom,
				controls: [new OpenLayers.Control.ModPanZoomBar(),
				           new OpenLayers.Control.ScaleLine({geodesic: true}),
				           displayCoords,
				           nav,
				           this.createDefaultOLPanel(nav)]
		};

		//merge default options and user specified options into 'options'--not recursive
		jQuery.extend(userOptions, options);
		//div defaults to 0 height for certain doc-types; we want the map to fill the parent container
		jQuery('#' + this.mapDiv).height("512px");

		//call OpenLayers.Map with function arguments

		// attempt to reload tile if load fails
		OpenLayers.IMAGE_RELOAD_ATTEMPTS = 3;
		OpenLayers.ImgPath = "resources/media/";
			// make OL compute scale according to WMS spec
			//OpenLayers.DOTS_PER_INCH = 90.71428571428572;
		OpenLayers.Util.onImageLoadErrorColor = 'transparent';
		
		OpenLayers.Map.call(this, "ogpMap", options);	
	};

	this.initMap = function (){
		//default background map
		this.basemaps = this.createBaseMaps();
		var defaultBasemapModel = this.basemaps.findWhere({name: "googlePhysical"});
		defaultBasemapModel.set({selected: true});
		defaultBasemapModel.get("initialRenderCallback").apply(defaultBasemapModel, [this]);

		var center = this.WGS84ToMercator(0, 0);
		//set map position
		this.setCenter(center);	
		
		this.addMapToolbarButton({displayClass: "saveImageButton", title: "Save map image", buttonText: "Save Image"}, this.saveImage);
		this.addMapToolbarButton({displayClass: "printButton", title: "Print map", buttonText: "Print"}, OpenGeoportal.Utility.doPrint);
		this.addToMapToolbar(this.template.basemapMenu());
		this.basemapMenu = new OpenGeoportal.Views.CollectionSelect({
										collection: this.basemaps, 
										el: "div#basemapMenu",
										valueAttribute: "name",
										displayAttribute: "displayName",
										buttonLabel: "Basemap",
										itemClass: "baseMapMenuItem"
										});
		jQuery(".olMap").find("[id*=event]").addClass("shadowDown").addClass("shadowRight");

	};

	this.registerMapEvents = function(){
		var that = this;
		//register events
		jQuery('#' + this.mapDiv).resize(function () {
			that.updateSize();
			if (parseInt(jQuery("#" + that.mapDiv).width()) >= 1024) {
				if (that.zoom == 0){
					that.zoomTo(1);
				}
			}
		});
		this.events.register('zoomend', this, function(){
			var zoomLevel = that.getZoom();
			//console.log(zoomLevel);
			var maxZoom = that.basemaps.findWhere({selected: true}).get("zoomLevels");
			if (zoomLevel >= (maxZoom - 1)){
				that.basemaps.findWhere({name: "googleHybrid"}).set({selected: true});
				that.zoomTo(that.getZoom());
			} else {
				/*if (that.getBackgroundType() !== that.getCurrentBackgroundMap()){
					that.changeBackgroundMap(that.getCurrentBackgroundMap());
				}*/
			}
			var mapHeight = Math.pow((zoomLevel + 1), 2) / 2 * 256;
			var containerHeight = jQuery("#" + that.mapDiv).parent().parent().height();
			if (mapHeight > containerHeight){
				mapHeight = containerHeight;
			}

			if (jQuery("#" + that.mapDiv).height() != mapHeight){
				jQuery("#" + that.mapDiv).height(mapHeight);//calculate min and max sizes
				that.updateSize();
			}
			if (zoomLevel == 0){
				that.setCenter(that.WGS84ToMercator(that.getSearchCenter().lon, 0));
			} 
			//console.log('zoomend');
			jQuery(document).trigger('eventZoomEnd');
		});

		this.events.register('moveend', this, function(){
			console.log("moveend");
			var newExtent = that.getSearchExtent();
			var newCenter = that.getSearchCenter();
			//TODO: move this to the map object, register the map object in app state
			//that.appState.set({mapExtent: newExtent});
			jQuery(document).trigger('map.extentChanged', {mapExtent: newExtent, mapCenter: newCenter});
		});

		this.bboxHandler();
		this.styleChangeHandler();
		this.opacityHandler();
		this.zoomToLayerExtentHandler();
		this.previewLayerHandler();
		this.getFeatureInfoHandler();
		this.clearLayersHandler();
		this.attributeDescriptionHandler();
		this.mouseCursorHandler();
	};

	this.mouseCursorHandler = function(){
		var that = this;
		jQuery(document).on("attributeInfoOn", ".olMap", function(){
				jQuery(this).css('cursor', "crosshair");
				//also deactivate regular map controls
				var zoomControl = that.getControlsByClass("OpenLayers.Control.ZoomBox")[0];
				if(zoomControl.active){
					zoomControl.deactivate();
				}
				var panControl = that.getControlsByClass("OpenLayers.Control.Navigation")[0];
				if(panControl.active){
					panControl.deactivate();
				}
		});
	};

	this.clearLayersHandler = function(){
		var that = this;
				//TODO: this should be in the previewed layers view.  clearing the map should update the previewed layers collection, which triggers
		//removal from the map.
		var mapClear$ = jQuery("#mapClearButton");
		mapClear$.button();
		mapClear$.on("click", function(event){
			//alert("button clicked");
			that.clearMap();}
		);
	};
	
	this.mapControlUIHandler = function(){
		//'hover' for graphics that are not background graphics
		var zoomPlusSelector = '.olControlModPanZoomBar img[id*="zoomin"]';
		jQuery(document).on("mouseenter", zoomPlusSelector, function(){
			jQuery(this).attr("src", that.utility.getImage("slider_plus_hover.png"));
			//jQuery(this).css("cursor", "pointer");
		});

		jQuery(document).on("mouseleave", zoomPlusSelector, function(){
			jQuery(this).attr("src", that.utility.getImage("zoom-plus-mini.png"));
		});

		jQuery(document).on("click", zoomPlusSelector, function(){
			that.mapObject.zoomIn();
		});

		var zoomMinusSelector = '.olControlModPanZoomBar img[id*="zoomout"]';
		jQuery(document).on("mouseenter", zoomMinusSelector, function(){
			jQuery(this).attr("src", that.utility.getImage("slider_minus_hover.png"));
			//jQuery(this).css("cursor", "pointer");
		});

		jQuery(document).on("mouseleave", zoomMinusSelector, function(){
			jQuery(this).attr("src", that.utility.getImage("zoom-minus-mini.png"));
		});

		jQuery(document).on("click", zoomMinusSelector, function(){
			that.mapObject.zoomOut();
		});	

	};
	
	this.addToMapToolbar = function(markup){
		jQuery("#ogpMapButtons").append(markup);
	};
	
	this.addMapToolbarButton = function(displayParams, callbackHandler){
		this.addToMapToolbar(this.template.mapButton(displayParams));
		var that = this;
		jQuery("." + displayParams.displayClass).button().on("click", function(){callbackHandler.call(that);});
	};
	

	this.saveImage = function(imageFormat, resolution){
		//TODO: add html5 canvas stuff...may have to wait for OL3?
		imageFormat = 'png';
		var format;
		switch (imageFormat){
		case 'jpeg':
			format = "image/jpeg";
			break;
		case 'png':
			format = "image/png";
			break;
		case 'bmp':
			format = "image/bmp";
			break;
		default: throw new Error("This image format (" + imageFormat + ") is unavailable.");
		}

		var requestObj = {type: "image"};
		requestObj.layers = [];

		for (var layer in this.layers){
			var currentLayer = this.layers[layer];
			if (currentLayer.CLASS_NAME != "OpenLayers.Layer.WMS"){
				continue;
			}
			if (currentLayer.visibility == false){
				continue;
			}
			var layerModel = this.previewed.findWhere({LayerId: currentLayer.ogpLayerId});
			if (typeof layerModel == "undefined"){
				throw new Error("Layer ['" + currentLayer.ogpLayerId + "'] could not be found in the PreviewedLayers collection.");
			}
			var sld = layerModel.get("sld");
			var opacity = layerModel.get("opacity");
			if (opacity == 0){
				continue;
			}
			//insert this opacity value into the sld to pass to the wms server
			var layerObj = {};
			var storedName = layerModel.get("qualifiedName");
			if (storedName == ''){
				layerObj.name = currentLayer.params.LAYERS;
			} else {
				layerObj.name = storedName;
			}
			layerObj.opacity = opacity;
			layerObj.zIndex = this.getLayerIndex(currentLayer);
			if ((typeof sld != 'undefined')&&(sld !== null)&&(sld != "")){
				var sldParams = [{wmsName: layerObj.name, layerStyle: sld}];
				layerObj.sld = this.createSLDFromParams(sldParams);
			}
			layerObj.layerId = layerModel.get("LayerId");
			requestObj.layers.push(layerObj);
		}

		var extent = this.getVisibleExtent();
		var bbox = extent.toBBOX();
		
		requestObj.format = format;
		requestObj.bbox = bbox;
		requestObj.srs = 'EPSG:900913';
		var offset = this.getMapOffset();
		var ar = this.getAspectRatio(extent);
		//this doesn't really work... should get appropriate width and height based on bbox
		var currSize = this.getCurrentSize();
		requestObj.width =  currSize.w - offset.x;
		requestObj.height = parseInt(requestObj.width / ar); 
		//add the request to the queue
		OpenGeoportal.ogp.appState.get("requestQueue").createRequest(requestObj);
	};
	
	this.getAspectRatio = function(extent){
		return (extent.getWidth()/extent.getHeight());
	};
	/**
	 * sets the background map to the value in the background map dropdown menu.  called by change for the basemap radio button set
	 */
	/*this.basemapHandler = function(){
		var that = this;
		jQuery("[name=basemapRadio]").on("change", function(){
			var value = jQuery('input:radio[name=basemapRadio]:checked').val();
			that.basemaps.findWhere({name: value}).set({selected: true});
		});
	};*/
	
/*	this.getBackgroundType = function() {
		var layers = this.layers;
		for (var i in layers){
			if ((layers[i].CLASS_NAME == "OpenLayers.Layer.Google")&&(layers[i].visibility == true)
					&&layers[i].opacity == 1){
				return layers[i].type;
			} else {
				return "osm";
			}
		}
	};
*/
	this.createBaseMaps = function(){
		var that = this;
		var googlePhysical = {
			displayName: "Google Physical",
			name: "googlePhysical",
			selected: false,
			subType: google.maps.MapTypeId.TERRAIN,
			type: "Google",
			zoomLevels: 15,
			getLayerDefinition: function(){
				var bgMap = new OpenLayers.Layer.Google(
					this.get("displayName"),
					{
						type: this.get("subType"),
						basemapType: this.get("type"),
						layerRole: "basemap"
					},
					{
						animationEnabled: true
					}
					);
				return bgMap;
				},
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					that.addLayer(model.get("getLayerDefinition").call(model));
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.mapObject.setMapTypeId(model.get("subType"));
					layer.type = model.get("subType");
					layer.setVisibility(true);
				}
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");	

			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				layer.setVisibility(false);
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "none");	
			},
			initialRenderCallback: function(mapController){
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				console.log(bgMap);
				google.maps.event.addListener(bgMap.mapObject, "tilesloaded", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					jQuery(document).trigger("mapReady");
					//really should only fire the first time (or should only listen the first time)
					google.maps.event.clearListeners(bgMap.mapObject, "tilesloaded");					
					jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");
					//find the google logo and add class ".googleLogo", so we can make sure it always shows
					jQuery("[id$=GMapContainer]").find('[title*="Click to see this area"]').parent().addClass("googleLogo");
					jQuery("#geoportalMap").fadeTo("slow", 1);

				});
			}
		};
		
		var googleHybrid = {
			displayName: "Google Hybrid",
			name: "googleHybrid",
			selected: false,
			subType: google.maps.MapTypeId.HYBRID,
			type: "Google",
			zoomLevels: 22,
			getLayerDefinition: function(){
				var bgMap = new OpenLayers.Layer.Google(
					this.get("displayName"),
					{
						type: this.get("subType"),
						basemapType: this.get("type"),
						layerRole: "basemap"
					},
					{
						animationEnabled: true
					}
					);
				return bgMap;
				},
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					that.addLayer(model.get("getLayerDefinition").call(model));
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.mapObject.setMapTypeId(model.get("subType"));
					layer.type = model.get("subType");
					layer.setVisibility(true);
				}
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");

			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				layer.setVisibility(false);
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "none");	
			},
			initialRenderCallback: function(mapController){
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				google.maps.event.addListener(bgMap.mapObject, "tilesloaded", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					jQuery(document).trigger("mapReady");
					//really should only fire the first time
					google.maps.event.clearListeners(bgMap.mapObject, "tilesloaded");
					jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");
					//find the google logo and add class ".googleLogo", so we can make sure it always shows
					jQuery("[id$=GMapContainer]").find('[title*="Click to see this area"]').parent().addClass("googleLogo");
					jQuery("#geoportalMap").fadeTo("slow", 1);

				});
			}
		};
		
		var googleSat = {
			displayName: "Google Satellite",
			name: "googleSatellite",
			selected: false,
			subType: google.maps.MapTypeId.SATELLITE,
			type: "Google",
			zoomLevels: 22,
			getLayerDefinition: function(){
				var bgMap = new OpenLayers.Layer.Google(
					this.get("displayName"),
					{
						type: this.get("subType"),
						basemapType: this.get("type"),
						layerRole: "basemap"
					},
					{
						animationEnabled: true
					}
					);
				return bgMap;
				},
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					that.addLayer(model.get("getLayerDefinition").call(model));
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.mapObject.setMapTypeId(model.get("subType"));
					layer.type = model.get("subType");
					layer.setVisibility(true);
					jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");
				}

			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				//if the new base map is the same type, don't change visibility
				layer.setVisibility(false);
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "none");	
			},
			initialRenderCallback: function(mapController){
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				google.maps.event.addListener(bgMap.mapObject, "tilesloaded", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					jQuery(document).trigger("mapReady");
					//really should only fire the first time
					google.maps.event.clearListeners(bgMap.mapObject, "tilesloaded");
					jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");
					//find the google logo and add class ".googleLogo", so we can make sure it always shows
					jQuery("[id$=GMapContainer]").find('[title*="Click to see this area"]').parent().addClass("googleLogo");
					jQuery("#geoportalMap").fadeTo("slow", 1);

				});
			}
		};
		
		var googleStreets = {
			displayName: "Google Streets",
			name: "googleStreets",
			selected: false,
			subType: google.maps.MapTypeId.ROADMAP,
			type: "Google",
			zoomLevels: 20,
			getLayerDefinition: function(){
				var bgMap = new OpenLayers.Layer.Google(
					this.get("displayName"),
					{
						type: this.get("subType"),
						basemapType: this.get("type"),
						layerRole: "basemap"
					},
					{
						animationEnabled: true
					}
					);
				return bgMap;
				},
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					that.addLayer(model.get("getLayerDefinition").call(model));
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.mapObject.setMapTypeId(model.get("subType"));
					layer.type = model.get("subType");
					layer.setVisibility(true);
				}
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");
			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				layer.setVisibility(false);
				jQuery("div.olLayerGooglePoweredBy").children().css("display", "none");	
			},
			initialRenderCallback: function(mapController){
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				google.maps.event.addListener(bgMap.mapObject, "tilesloaded", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					jQuery(document).trigger("mapReady");
					//really should only fire the first time
					google.maps.event.clearListeners(bgMap.mapObject, "tilesloaded");
					jQuery("div.olLayerGooglePoweredBy").children().css("display", "block");
					//find the google logo and add class ".googleLogo", so we can make sure it always shows
					jQuery("[id$=GMapContainer]").find('[title*="Click to see this area"]').parent().addClass("googleLogo");
					jQuery("#geoportalMap").fadeTo("slow", 1);

				});
			}
		};
		
		var osm = {
			displayName: "OpenStreetMap",
			name: "osm",
			selected: false,
			type: "osm",
			subType: "osm",
			zoomLevels: 17,
			getLayerDefinition: function(){
				var bgMap = new OpenLayers.Layer.OSM(
					this.get("displayName"),
					null,
					{
						basemapType: this.get("type"),
						layerRole: "basemap"
					}
				);
				//console.log(bgMap);
				return bgMap;
				},
				
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					var newLayer = model.get("getLayerDefinition").call(model);
					var displayLayers = that.layers; //getLayerIndex
					var highestBasemap = 0;
					for (var i in displayLayers){
						if (displayLayers[i].layerRole != "basemap"){
							var indx = that.getLayerIndex(displayLayers[i]);
							that.setLayerIndex(displayLayers[i], indx + 1);
						} else {
							highestBasemap = Math.max(highestBasemap, that.getLayerIndex(displayLayers[i]));
						}
					}
					that.addLayer(newLayer);
					that.setLayerIndex(newLayer, highestBasemap + 1);
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.setVisibility(true);
				}


			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				console.log("hide operations");
				console.log(layer);
				layer.setVisibility(false);
			},
			initialRenderCallback: function(mapController){
				console.log("osm initial render callback");
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				bgMap.events.register(bgMap.mapObject, "loadend", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					//really should only fire the first time
					bgMap.events.unregister(bgMap.mapObject, "loadend");
					jQuery("#geoportalMap").fadeTo("slow", 1);
				});
			}
		};
		
		var bingAerial = {
			displayName: "Bing Aerial",
			name: "bingAerial",
			selected: false,
			type: "bingAerial",
			subType: "Aerial",
			zoomLevels: 17,
			getLayerDefinition: function(){
			 	

/*Aerial - Aerial imagery.

AerialWithLabels - Aerial imagery with a road overlay.

Birdseye - Bird’s eye (oblique-angle) imagery

BirdseyeWithLabels - Bird’s eye imagery with a road overlay.

Road - Roads without additional imagery.	*/
				var bgMap = new OpenLayers.Layer.Bing(
					{
						name: this.get("displayName"),
						type: this.get("subType"),
						key: "AooVYTRT_gUIpHJzyG0lM9v39OvPRj6ThwwCjqV1LXVPvJ6HFos0oRuzk02wJfHl"
					}
				);
				bgMap.basemapType = this.get("type");
				bgMap.layerRole= "basemap";
				bgMap.wrapDateLine = true;
				console.log(bgMap);
				return bgMap;
				},
				
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					that.addLayer(model.get("getLayerDefinition").call(model));
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.setVisibility(true);
				}

			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				console.log("hide operations");
				console.log(layer);
				layer.setVisibility(false);
			},
			initialRenderCallback: function(mapController){
				console.log("bing initial render callback");
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				bgMap.events.register(bgMap.mapObject, "loadend", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					//really should only fire the first time
					bgMap.events.unregister(bgMap.mapObject, "loadend");
					jQuery("#geoportalMap").fadeTo("slow", 1);
				});
			}
		};
		
		var bingHybrid = {
			displayName: "Bing Hybrid",
			name: "bingAerialWithLabels",
			selected: false,
			type: "bingHybrid",
			subType: "AerialWithLabels",
			zoomLevels: 17,
			getLayerDefinition: function(){
			 	

/*Aerial - Aerial imagery.

AerialWithLabels - Aerial imagery with a road overlay.

Birdseye - Bird’s eye (oblique-angle) imagery

BirdseyeWithLabels - Bird’s eye imagery with a road overlay.

Road - Roads without additional imagery.	*/
				var bgMap = new OpenLayers.Layer.Bing(
					{
						name: this.get("displayName"),
						type: this.get("subType"),
						key: "AooVYTRT_gUIpHJzyG0lM9v39OvPRj6ThwwCjqV1LXVPvJ6HFos0oRuzk02wJfHl"
					}
				);
				bgMap.basemapType = this.get("type");
				bgMap.layerRole= "basemap";
				console.log(bgMap);
				return bgMap;
				},
				
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					that.addLayer(model.get("getLayerDefinition").call(model));
				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.setVisibility(true);
				}


			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];

				layer.setVisibility(false);
			},
			initialRenderCallback: function(mapController){
				console.log("bing initial render callback");
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				bgMap.events.register(bgMap.mapObject, "loadend", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					//really should only fire the first time
					bgMap.events.unregister(bgMap.mapObject, "loadend");
					jQuery("#geoportalMap").fadeTo("slow", 1);
				});
			}
		};
		
		
		var bingRoad = {
			displayName: "Bing Road",
			name: "bingRoad",
			selected: false,
			type: "bingRoad",
			subType: "Road",
			zoomLevels: 17,
			getLayerDefinition: function(){

				var bgMap = new OpenLayers.Layer.Bing(
					{
						name: this.get("displayName"),
						type: this.get("subType"),
						key: "AooVYTRT_gUIpHJzyG0lM9v39OvPRj6ThwwCjqV1LXVPvJ6HFos0oRuzk02wJfHl"
					}
				);
				bgMap.basemapType = this.get("type");
				bgMap.layerRole= "basemap";
				console.log(bgMap);
				return bgMap;
				},
				
			showOperations: function(model){
				//see if there is a basemap layer of the specified type
				if (that.getLayersBy("basemapType", model.get("type")).length === 0){
					//add the appropriate basemap layer
					var bgLayer = model.get("getLayerDefinition").call(model);
					that.addLayer(bgLayer);
					bgLayer.setVisibility(false);
					bgLayer.setVisibility(true);
					//var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					//layer.setVisibility(true);
					

				} else {
					var layer = that.getLayersBy("basemapType", model.get("type"))[0];
					layer.setVisibility(true);
				}

			},
			hideOperations: function(model){
				var layer = that.getLayersBy("basemapType", model.get("type"))[0];
				console.log("hide operations");
				console.log(layer);
				layer.setVisibility(false);
			},
			initialRenderCallback: function(mapController){
				console.log("bing initial render callback");
				var bgMap = mapController.getLayersBy("basemapType", this.get("type"))[0];
				bgMap.events.register(bgMap.mapObject, "loadend", function() {
					//console.log("Tiles loaded");
					mapController.render(mapController.mapDiv);
					//really should only fire the first time
					bgMap.events.unregister(bgMap.mapObject, "loadend");
					jQuery("#geoportalMap").fadeTo("slow", 1);
				});
			}
		};
		
		var models = [googlePhysical, googleHybrid, googleSat, osm];

		//create an instance of the basemap collection
		var collection = new OpenGeoportal.BasemapCollection(models);
		return collection;
		
	};

//	utility functions
	this.WGS84ToMercator = function (lon, lat){
		//returns -infinity for -90.0 lat; a bug?
		lat = parseFloat(lat);
		lon = parseFloat(lon);
		if (lat >= 90){
			lat = 89.99;
		}
		if (lat <= -90){
			lat = -89.99;
		}
		if (lon >= 180){
			lon = 179.99;
		}
		if (lon <= -180){
			lon = -179.99;
		}
		//console.log([lon, "tomercator"])
		return OpenLayers.Layer.SphericalMercator.forwardMercator(lon, lat);
	};

	this.MercatorToWGS84 = function (lon, lat) {
		lat = parseFloat(lat);
		lon = parseFloat(lon);
		var transformedValue = OpenLayers.Layer.SphericalMercator.inverseMercator(lon, lat);
		var newLat = transformedValue.lat;
		var newLon = transformedValue.lon;
		if (newLat > 90){
			newLat = 90;
		}
		if (newLat < -90){
			newLat = -90;
		}
		if (newLon > 180){
			newLon = 180;
		}
		if (newLon < -180){
			newLon = -180;
		}
		return new OpenLayers.LonLat(newLon, newLat);
	};

	this.clearMap = function (){
		this.previewed.each(function(model){
			model.set({preview: "off"});
		});
	};

	this.processMetadataSolrResponse = function(data){
		var solrResponse = data.response;
		var totalResults = solrResponse.numFound;
		if (totalResults != 1){
			throw new Error("Request for Metadata returned " + totalResults +".  Exactly 1 was expected.");
			return;
		}
		var doc = solrResponse.docs[0];  // get the first layer object
		return doc;
	};
	
	this.getAttributeDescriptionJsonpSuccess = function(data) {
		jQuery(".attributeName").css("cursor", "default");
		
		var that = this; 
		
		var solrdoc = this.processMetadataSolrResponse(data);
		var xmlDoc = jQuery.parseXML(solrdoc.FgdcText);  // text was escaped on ingest into Solr

		var layerId = jQuery("td.attributeName").first().closest("table").find("caption").attr("title");
		var layerAttrs = this.previewed.get(layerId).get("layerAttributes");
		
		jQuery(xmlDoc).find("attrlabl").each(function(){
			var currentXmlAttribute$ = jQuery(this);
			jQuery("td.attributeName").each(function(){
				var attributeName = jQuery(this).text().trim();
				if (currentXmlAttribute$.text().trim().toLowerCase() == attributeName.toLowerCase()){
					var attributeDescription = currentXmlAttribute$.siblings("attrdef").first();
					attributeDescription = OpenGeoportal.Utility.stripExtraSpaces(attributeDescription.text().trim());
					if (attributeDescription.length === 0){
						attributeDescription = "No description available";
					}
					jQuery(this).attr('title', attributeDescription);
					layerAttrs.findWhere({attributeName: attributeName}).set({description: attributeDescription});
					return;
				}
			});
		});
	};

	this.getAttributeDescriptionJsonpError = function () {
		jQuery(".attributeName").css("cursor", "default");
		throw new Error("The attribute description could not be retrieved.");
	};
	
	
	this.attributeDescriptionHandler = function(){
		//mouseover to display attribute descriptions
		var that = this;
		jQuery(document).on('mouseenter', "td.attributeName", function() {
			var layerId = jQuery(this).closest("table").find("caption").attr("title");
			var layerAttrs = that.previewed.get(layerId).get("layerAttributes");

			var attrModel = layerAttrs.findWhere({attributeName: jQuery(this).text().trim()});

			if (typeof attrModel !== "undefined" && attrModel.has("description")){
				jQuery(this).attr('title', attrModel.get("description"));
				//short circuit if attributes have already been looked up
			} else {
				var solr = new OpenGeoportal.Solr();
				var query = solr.getServerName() + "?" + jQuery.param(solr.getMetadataParams(layerId));
				jQuery(".attributeName").css("cursor", "wait");
				solr.sendToSolr(query, that.getAttributeDescriptionJsonpSuccess, that.getAttributeDescriptionJsonpError, that);
			}
		});
	};

	this.getFeatureAttributes = function(e){
		//console.log("getFeatureAttributes");
		if (typeof this.map != "undefined"){
			var mapObject = this.map;//since this is an event handler, the context isn't the MapController Object, it's the map layer. Should it be?

			//generate the query string
			var layerId = this.ogpLayerId;
			var searchString = "ogpid=" + layerId;
			
			var mapExtent = mapObject.getExtent();
			searchString += "&bbox=" + mapExtent.toBBOX();			
			
			var pixel = e.xy;
			//geoserver doesn't like fractional pixel values
			searchString += "&x=" + Math.round(pixel.x) + "&y=" + Math.round(pixel.y);
			searchString += "&height=" + mapObject.size.h + "&width=" + mapObject.size.w;
			
			var layerModel = mapObject.previewed.findWhere({LayerId: layerId});			
			var dialogTitle =  layerModel.get("LayerDisplayName");
			var institution = layerModel.get("Institution");

			var ajaxParams = {
					type: "GET",
					url: 'featureInfo',
					data: searchString,
					dataType: 'html',
					beforeSend: function(){
						if (mapObject.currentAttributeRequests.length > 0){
							//abort any outstanding requests before submitting a new one
							for (var i in mapObject.currentAttributeRequests) {					
								mapObject.currentAttributeRequests.splice(i, 1)[0].abort();
							}
						}
						
						jQuery(document).trigger("showLoadIndicator");
					},
					success: function(data, textStatus, XMLHttpRequest){
						//create a new dialog instance, or just open the dialog if it already exists
						mapObject.getFeatureAttributesSuccessCallback(layerId, dialogTitle, data);
					},
					error: function(jqXHR, textStatus, errorThrown) {
						if ((jqXHR.status != 401)&&(textStatus != 'abort')){
							new OpenGeoportal.ErrorObject(new Error(), "Error retrieving Feature Information.");
						}
					},
					complete: function(jqXHR){
						for (var i in mapObject.currentAttributeRequests){
							if (mapObject.currentAttributeRequests[i] === jqXHR){
								var spliced = mapObject.currentAttributeRequests.splice(i, 1);						
         	
							}
						}

						jQuery(document).trigger("hideLoadIndicator");
					}
			};

 
			mapObject.currentAttributeRequests.push(jQuery.ajax(ajaxParams));
			
			
			analytics.track("Layer Attributes Viewed", institution, layerId);
		} else {
			new OpenGeoportal.ErrorObject(new Error(), "This layer has not been previewed. <br/>You must preview it before getting attribute information.");
		}
	};

	this.currentAttributeRequests = [];
	
	this.registerAttributes = function(layerId, attrNames){
		var layerModel = this.previewed.get(layerId);
		if (!layerModel.has("layerAttributes")){
			var attributes = new OpenGeoportal.Attributes();
			for (var i in attrNames){
				var attrModel = new OpenGeoportal.Models.Attribute({attributeName: attrNames[i]});
				attributes.add(attrModel);
			}
			layerModel.set({layerAttributes: attributes});
		}
	};
	
	this.getFeatureAttributesSuccessCallback = function(layerId, dialogTitle, data) {		
		//grab the html table from the response
		var responseTable$ = jQuery(data).filter(function() {
			return jQuery(this).is('table');
		});			
		
		var template = this.template;
		var tableText = "";
		
		if ((responseTable$.length === 0) || (jQuery(data).find("tr").length === 0)){
			//what should happen here?  returned content is empty or otherwise unexpected	
			tableText = '<p>There is no data for "' + dialogTitle + '" at this point.</p>';
		} else {
			responseTable$ = responseTable$.first();
			//process the html table returned from wms getfeature request
			var rows = this.processAttributeTable(responseTable$);

			tableText = template.attributeTable({
				layerId: layerId,
				title : dialogTitle,
				tableContent : rows
			});
			
			var attrNames = [];
			for (var i in rows){
				attrNames.push(rows[i].header);
			}
			this.registerAttributes(layerId, attrNames);

		}
		
		//create a new dialog instance, or just open the dialog if it already exists

		if ( typeof jQuery('#featureInfo')[0] == 'undefined') {
			var infoDiv = template.genericDialogShell({
				id : "featureInfo"
			});
			jQuery("#dialogs").append(infoDiv);
			jQuery("#featureInfo").dialog({
				zIndex : 2999,
				title : "Feature Attributes",
				width : 'auto',
				autoOpen : false
			});

		}
		jQuery("#featureInfo").fadeOut(200, function(){
			jQuery("#featureInfo").html(tableText);
			//limit the height of the dialog.  some layers will have hundreds of attributes
			var containerHeight = jQuery("#container").height();
			var linecount = jQuery("#featureInfo tr").length;
			var dataHeight = linecount * 20;
			if (dataHeight > containerHeight) {
				dataHeight = containerHeight;
			} else {
				dataHeight = "auto";
			}
			jQuery("#featureInfo").dialog("option", "height", dataHeight);
			
			jQuery("#featureInfo").dialog('open');
			jQuery("#featureInfo").fadeIn(200);
			});
		

		
		
	}; 

	
	this.processAttributeTable = function(responseTable$) {
		var tableArr = [];
		if (responseTable$.find("tr").length === 2) {
			//horizontal table returned
			responseTable$.find("tr").each(function() {

				if (jQuery(this).find("th").length > 0) {
					//this is the header row
					var cells$ = jQuery(this).find("th");

				} else {
					var cells$ = jQuery(this).find("td");
				}
				var rowArr = [];
				cells$.each(function() {
					var cellText = jQuery(this).text().trim();
					if (cellText.indexOf('http') === 0) {
						cellText = '<a href="' + cellText + '">' + cellText + '</a>';
					}
					rowArr.push(cellText);
				});
				tableArr.push(rowArr);
			});

		} else {
			//vertical table returned
			//TODO: handle vertical table case
		}
	
		//iterate over headers
		var rows = [];
		if (tableArr.length > 0){
			
		for (var i = 0; i < tableArr[0].length; i++) {
			var newRowObj = {};
			newRowObj.values = [];
			for (var j = 0; j < tableArr.length; j++) {
				if (j === 0) {
					newRowObj.header = tableArr[j][i];
				} else {
					newRowObj.values.push(tableArr[j][i]);
				}

			}
			rows.push(newRowObj);
		}
		
		}
		
		return rows;
	}; 

//	methods to add layers

	this.hasMultipleWorlds = function(){
		var exp = this.getZoom() + 8;
		var globalWidth = Math.pow(2, exp);
		
		var viewPortWidth = this.getSize().w - this.getMapOffset().x;
		
	 	if (viewPortWidth > globalWidth){
	 		console.log("has multiple worlds");
	 		return true;
	 	} else {
	 		return false;
	 	}
	};
	
	this.bboxHandler = function(){
		var that = this;
		jQuery(document).on("map.showBBox", function(event, bbox){
			that.showLayerBBox(bbox);
		});
		jQuery(document).on("map.hideBBox", function(event){
			that.hideLayerBBox();
		});
	};

	this.hideLayerBBox = function () {
		if (this.getLayersByName("layerBBox").length > 0){
			var featureLayer = this.getLayersByName("layerBBox")[0];
			featureLayer.removeAllFeatures();
		}
		jQuery(".corner").hide();
	};

	this.createBBoxLayer = function(){
				var style_blue = OpenLayers.Util.extend({}, OpenLayers.Feature.Vector.style['default']);
			/*
			 * 4px border,
				border color: #1D6EEF, background color: #DAEDFF, box opacity: 25%
			 */
			style_blue.strokeColor = "#1D6EEF";
			style_blue.fillColor = "#DAEDFF";
			style_blue.fillOpacity = .25;
			style_blue.pointRadius = 10;
			style_blue.strokeWidth = 4;
			style_blue.strokeLinecap = "butt";
			style_blue.zIndex = 999;

			return new OpenLayers.Layer.Vector("layerBBox", {
				style: style_blue,
				displayOutsideMaxExtent: true
			});
	};
	
	this.showLayerBBox = function (mapObj) {
		//add or modify a layer with a vector representing the selected feature
		var featureLayer = this.getLayersByName("layerBBox");
		if (featureLayer.length > 0){
			featureLayer = featureLayer[0];
			this.hideLayerBBox();
		} else {
			featureLayer = this.createBBoxLayer();
			this.addLayer(featureLayer);
		}
		var bottomLeft = this.WGS84ToMercator(mapObj.west, mapObj.south);
		var topRight = this.WGS84ToMercator(mapObj.east, mapObj.north);

		if (bottomLeft.lon > topRight.lon) {
			var dateline = this.WGS84ToMercator(180,0).lon;
			var box1 = new OpenLayers.Feature.Vector(new OpenLayers.Bounds(bottomLeft.lon,bottomLeft.lat,dateline,topRight.lat).toGeometry());
			var box2 = new OpenLayers.Feature.Vector(new OpenLayers.Bounds(topRight.lon,topRight.lat,-1*dateline, bottomLeft.lat).toGeometry());
			featureLayer.addFeatures([box1, box2]);
		} 
		else {
			var box = new OpenLayers.Feature.Vector(new OpenLayers.Bounds(bottomLeft.lon,bottomLeft.lat,topRight.lon,topRight.lat).toGeometry());
			featureLayer.addFeatures([box]);
		}
		this.setLayerIndex(featureLayer, (this.layers.length -1));

		//do a comparison with current map extent
		var extent = this.getVisibleExtent(); 
		var geodeticExtent = this.getGeodeticExtent();
		var mapTop = extent.top;
		if (geodeticExtent.top > 83){
			mapTop = 238107694;
		}
		var mapBottom = extent.bottom;
		if (geodeticExtent.bottom < -83){
			mapBottom = -238107694;
		}
		var mapLeft = extent.left;
		if (geodeticExtent.left < -179){
			mapLeft = -20037510;
		}
		var mapRight = extent.right;
		if (geodeticExtent.right > 180){
			mapRight = 20037510;
		}

		var layerTop = topRight.lat;
		var layerBottom = bottomLeft.lat;
		var layerLeft = bottomLeft.lon;
		var layerRight = topRight.lon;
		
		var showEWArrows = true;
		//don't show arrows for east and west offscreen if multiple "worlds" are on screen
		if (this.hasMultipleWorlds()){
			showEWArrows = false;
			mapLeft = -20037510;
			mapRight = 20037510;
			extent.left = mapLeft;
			extent.Right = mapRight;
		}
		
		if (layerLeft < mapLeft || layerRight > mapRight || layerTop > mapTop || layerBottom < mapBottom) {
			//console.log("should show arrow");

			if (layerTop < mapTop && layerBottom > mapBottom) {
				if (showEWArrows){
					if (layerRight > mapRight) {
						//console.log("ne + se");
						this.showCorners(["ne", "se"]);
					}

					if (layerLeft < mapLeft) {
						//console.log("sw + nw");
						this.showCorners(["sw", "nw"]);
					}
				}
			} else if (layerRight < mapRight && layerLeft > mapLeft) {
				if (layerTop > mapTop) {
					//console.log("ne + nw");
					this.showCorners(["ne", "nw"]);
				}

				if (layerBottom < mapBottom) {
					this.showCorners(["se", "sw"]);
				}

			} else {
				//corners only
				if (layerTop > mapTop && layerRight > mapRight) {
					this.showCorners(["ne"]);
				}

				if (layerBottom < mapBottom && layerRight > mapRight) {
					this.showCorners(["se"]);
				}

				if (layerTop > mapTop && layerLeft < mapLeft) {
					this.showCorners(["nw"]);
				}

				if (layerBottom < mapBottom && layerLeft < mapLeft) {
					this.showCorners(["sw"]);
				}

			}

		}

		};


	this.showCorners = function(corners){
		var cornerIds = {
			ne: "neCorner",
			nw: "nwCorner",
			sw: "swCorner",
			se: "seCorner"
		};
		
		for (var i in corners){
			jQuery("#" + cornerIds[corners[i]]).show();
		}
	};
	
	this.addMapBBox = function (mapObj) {
		//mapObj requires west, east, north, south
		//add or modify a layer with a vector representing the selected feature
		var featureLayer;

		var style_green = OpenLayers.Util.extend({}, OpenLayers.Feature.Vector.style['default']);
		style_green.strokeColor = "green";
		style_green.fillColor = "green";
		style_green.fillOpacity = .05;
		//style_green.pointRadius = 10;
		style_green.strokeWidth = 2;
		style_green.strokeLinecap = "butt";
		style_green.zIndex = 999;

		featureLayer = new OpenLayers.Layer.Vector(mapObj.title, {
			//style: style_green
		});
		this.addLayer(featureLayer);
		var bbox = mapObj.bbox.split(",");
		var bottomLeft = this.WGS84ToMercator(bbox[0], bbox[1]);
		var topRight = this.WGS84ToMercator(bbox[2], bbox[3]);

		if (bottomLeft.lon > topRight.lon) {
			var dateline = this.WGS84ToMercator(180,0).lon;
			var box1 = new OpenLayers.Feature.Vector(new OpenLayers.Bounds(bottomLeft.lon,bottomLeft.lat,dateline,topRight.lat).toGeometry());
			var box2 = new OpenLayers.Feature.Vector(new OpenLayers.Bounds(topRight.lon,topRight.lat,-1*dateline, bottomLeft.lat).toGeometry());
			featureLayer.addFeatures([box1, box2]);
		} else {
			var box = new OpenLayers.Feature.Vector(new OpenLayers.Bounds(bottomLeft.lon,bottomLeft.lat,topRight.lon,topRight.lat).toGeometry());
			featureLayer.addFeatures([box]);
		}
		this.setLayerIndex(featureLayer, (this.layers.length -1));
	};

	this.startService = function(layerModel){
		//if layer has a startService value in the location field, try to start the service via the provided url
		var requestObj = {};
		requestObj.AddLayer = [layerModel.get("qualifiedName")];
		requestObj.ValidationKey = "OPENGEOPORTALROCKS";
		var params = {
				url: layerModel.get("parsedLocation").serviceStart,
				dataType: "jsonp",
				data: requestObj,
				type: "GET",
				traditional: true,
				complete: function(){
					jQuery(document).trigger("hideLoadIndicator");

				},
				statusCode: {
					200: function(){
						jQuery("body").trigger(layerModel.get("qualifiedName") + 'Exists');
					},
					500: function(){
						throw new Error("layer could not be added");
					}
				}
		};
	
		jQuery(document).trigger("showLoadIndicator");

		jQuery.ajax(params);
	};
	
	this.setWmsLayerInfo = function(model){
		var that = this; 
		var queryData = {ogpid: model.get("LayerId")};
    	var ajaxParams = {
    		type: "GET",
            url: 'info/wmsInfo',
            data: queryData,
            dataType: 'json',
			success: function(data){
					//{"owsProtocol":"WMS","infoMap":{"owsUrl":"http://geoserver01.uit.tufts.edu/wfs/WfsDispatcher?","owsType":"WFS","qualifiedName":"sde:GISPORTAL.GISOWNER01.WORLDBOUNDARIES95"},"owsDescribeInfo":null}
					jQuery("body").trigger(model.get("qualifiedName") + 'Exists');
					model.set({qualifiedName: data.infoMap.qualifiedName});
					//should we also set a wfs or wcs if found?...if the dataType is unknown, it should be updated to vector or raster
			},
			error: function(){
				if (model.get("parsedLocation").serviceStart != "undefined"){

					that.startService(model);
				} else {
					//let the user know the layer is not previewable
					throw new Error("layer could not be added");
				}
			},
			complete: function(){
				jQuery(document).trigger("hideLoadIndicator");
			}
    	};
    	jQuery.ajax(ajaxParams);
    	jQuery(document).trigger("showLoadIndicator");

	};
	
	
	this.layerExists = function (layerModel) {
		//otherwise, do a wms describe layer to make sure the layer is there before
		//attempting to add it to the map (must be proxied).  handling wms errors is non-trivial, since,
		//by design, OpenLayers requires an error of type 'image' from the wms server
		//(OpenLayers is merely dynamically setting the src attribute of img tags)
		//console.log(mapObj);
		if (layerModel.get("parsedLocation").wms !== "undefined"){
			this.setWmsLayerInfo(layerModel);
		} else {
			//assume it exists
			jQuery("body").trigger(layerModel.get("qualifiedName") + 'Exists');
		}
	};

	this.getPreviewUrlArray = function (layerModel, useTilecache) {
		//is layer public or private? is this a request that can be handled by a tilecache?
		//is this a wms request? something to think about.  for now, we only support wms previews
		var urlArraySize = 3; //this seems to be a good size for OpenLayers performance
		var urlArray = [];
		var populateUrlArray = function(addressArray){
			if (addressArray.length == 1){
				for (var i=0; i < urlArraySize; i++){
					urlArray[i] = addressArray[0];
				}
			} else {
				urlArray = addressArray;
			}

		};
		
		//check for a proxy here
    	var proxy = OpenGeoportal.Config.getWMSProxy(layerModel.get("Institution"), layerModel.get("Access"));
    	if (proxy){
    		layerModel.set({wmsProxy: proxy});
    	}
    	
		if (layerModel.has("wmsProxy")){
			populateUrlArray([layerModel.get("wmsProxy")]);
		} else if ((typeof layerModel.get("parsedLocation").tilecache !== "undefined") && useTilecache){
			populateUrlArray(layerModel.get("parsedLocation").tilecache);
		} else {
			populateUrlArray(layerModel.get("parsedLocation").wms);
		}

		console.log(urlArray);
		return urlArray;
	};

	this.addWMSLayer = function (layerModel){
//		mapObj requires institution, layerName, title, datatype, access
		/*var bottomLeft = this.WGS84ToMercator(mapObj.west, mapObj.south);
	var topRight = this.WGS84ToMercator(mapObj.east, mapObj.north);
	var bounds = new OpenLayers.Bounds();
	bounds.extend(new OpenLayers.LonLat(bottomLeft.lon, bottomLeft.lat));
    bounds.extend(new OpenLayers.LonLat(topRight.lon, topRight.lat));
    console.log(bounds);
	 var box = new OpenLayers.Feature.Vector(bounds.toGeometry());
	 var featureLayer = new OpenLayers.Layer.Vector("BBoxTest");
	 featureLayer.addFeatures([box]);
	 this.addLayer(featureLayer);*/

		var layerId = layerModel.get("LayerId");
        //check to see if layer is on openlayers map, if so, show layer
        var opacitySetting = layerModel.get("opacity");
        
  		var matchingLayers = this.getLayersBy("ogpLayerId", layerId);
        for (var i in matchingLayers){
            	this.showLayer(layerId);
            	matchingLayers[i].setOpacity(opacitySetting * .01);
            	return;
        } 
        
        if (matchingLayers.length > 1){
        	console.log("ERROR: There should never be more than one copy of the layer on the map");
        }
        
		//use a tilecache if we are aware of it
    	

		var wmsArray = this.getPreviewUrlArray(layerModel, true);
		//add the namespace if it's not already in the name
		var wmsNamespace = layerModel.get("WorkspaceName");
		var layerName = layerModel.get("Name");
		if ((wmsNamespace.length > 0)&&(layerName.indexOf(":") == -1)){
				layerName = wmsNamespace + ":" + layerName;
		}
			
		layerModel.set({qualifiedName: layerName});
			
		//tilecache and GeoServer names are different for Harvard layers
		if (layerModel.get("Institution") === "Harvard"){
			layerName = layerName.substr(layerName.indexOf(".") + 1);
			layerName = layerName.substr(layerName.indexOf(":") + 1);
		}		
		
		

		//won't actually do anything, since noMagic is true and transparent is true
		var format;
		var dataType = layerModel.get("DataType");
		if ((dataType == "Raster")||(dataType == "Paper Map")){
			format = "image/jpeg";
		} else {
			format = "image/png";
		}
		
//		if this is a raster layer, we should use jpeg format, png for vector (per geoserver docs)
		var newLayer = new OpenLayers.Layer.WMS( 
				layerModel.get("LayerDisplayName"),
				wmsArray,
				{
					layers: layerName,
					format: format, 
					tiled: true,
					exceptions: "application/vnd.ogc.se_xml",
					transparent: true,
					version: "1.3.0"
				},
				{
					transitionEffect: 'resize',
					opacity: opacitySetting * .01,
					ogpLayerId: layerModel.get("LayerId"),
					ogpLayerRole: "LayerPreview"
				});
		//how should this change? trigger custom events with jQuery
		newLayer.events.register('loadstart', newLayer, function() {jQuery(document).trigger("showLoadIndicator");});
		newLayer.events.register('loadend', newLayer, function() {jQuery(document).trigger("hideLoadIndicator");});
		var that = this;
		//we do a check to see if the layer exists before we add it
		jQuery("body").bind(layerModel.get("qualifiedName") + 'Exists', function(){that.addLayer(newLayer);});
		this.layerExists(layerModel);

	};

//	thanks to Allen Lin, U of MN
	this.addArcGISRestLayer = function (layerModel) {
		//won't actually do anything, since noMagic is true and transparent is true
		var format = "image/jpeg";
		//if (layerModel.isVector){
		//	format = "image/png";
		//} else {
		//	format = "image/jpeg";
		//}

//		if this is a raster layer, we should use jpeg format, png for vector (per geoserver docs)
		var newLayer = new OpenLayers.Layer.ArcGIS93Rest( 
			"test",
			layerModel.get("parsedLocation").ArcGISRest,
				{
					layers: "show:" + "test",
					transparent: true
				},
				{
					buffer: 0,
					transitionEffect: 'resize',
					opacity: layerModel.get("opacity"),
					ogpLayerId: layerModel.get("LayerId")
				});
		newLayer.projection = new OpenLayers.Projection("EPSG:3857");
		//how should this change? trigger custom events with jQuery
		newLayer.events.register('loadstart', newLayer, function() {jQuery(document).trigger("showLoadIndicator");});
		newLayer.events.register('loadend', newLayer, function() {jQuery(document).trigger("hideLoadIndicator");});
		var that = this;
		//we do a cursory check to see if the layer exists before we add it
		that.addLayer(newLayer);
		//jQuery("body").bind(newLayer.ogpLayerId + 'Exists', function(){that.addLayer(newLayer);});
		this.layerExists(layerModel);
	};

	this.opacityHandler = function(){
		var that = this;
		jQuery(document).on("map.opacityChange", function(event, data){
			console.log(data);
			for (var i in that.getLayersBy("ogpLayerId", data.LayerId)){
				that.getLayersBy("ogpLayerId", data.LayerId)[0].setOpacity(data.opacity * .01);
			}
		});
	};

	this.previewLayerHandler = function(){
		var that = this;
		jQuery(document).on("previewLayerOn", function(event, data){
			that.previewLayerOn(data.LayerId);
		});
		
		jQuery(document).on("previewLayerOff", function(event, data){
			that.previewLayerOff(data.LayerId);
		});
	};
	
	this.styleChangeHandler = function(){
		var that = this;
		jQuery(document).on("map.styleChange", function(event, data){
			that.changeStyle(data.LayerId);
		});
	};

	this.changeStyle = function(layerId){
		var layer = this.getLayersBy("ogpLayerId", layerId)[0];
		if (typeof layer == 'undefined'){
			console.log("layer with id=['" + layerId + "'] not found on map.");
			//should we try to add it then?
			return;
		}

		var layerModel = this.previewed.findWhere({LayerId: layerId});
		if (typeof layerModel == "undefined"){
			throw new Error("This layer can't be found in the PreviewedLayers collection.");
		}
		console.log(layerModel);
		var dataType = layerModel.get("DataType").toLowerCase();
		var userSLD = {};
		//we need this for now, since the tilecache name and geoserver name for layers is different for Harvard layers
		var wmsName = layerModel.get("qualifiedName");
		//don't use a tilecache
		layer.url = this.getPreviewUrlArray(layerModel, false);
		var userColor = layerModel.get("color");
		var userWidth = layerModel.get("graphicWidth");
		switch (dataType){
		case "polygon":
			//for polygons
			userSLD.symbolizer = {};
			userSLD.symbolizer.Polygon = {};
			userSLD.symbolizer.Polygon.fill = true;
			userSLD.symbolizer.Polygon.fillColor = userColor;
			if (userWidth > 0){
				userSLD.symbolizer.Polygon.stroke = true;
				userSLD.symbolizer.Polygon.strokeWidth = userWidth;
				userSLD.symbolizer.Polygon.strokeColor = this.getBorderColor(userColor);
			}
			break;
		case "point":
			//for points
			userSLD.symbolizer = {};
			userSLD.symbolizer.Point = {};
			userSLD.symbolizer.Point.fill = true;
			userSLD.symbolizer.Point.fillColor = userColor;
			userSLD.symbolizer.Point.graphicName = 'circle';
			userSLD.symbolizer.Point.pointRadius = userWidth;
			userSLD.symbolizer.Point.strokeWidth = 0;
			userSLD.symbolizer.Point.strokeColor = userColor;
			break;
		case "line":
			//for lines	
			userSLD.symbolizer = {};
			userSLD.symbolizer.Line = {};
			userSLD.symbolizer.Line.stroke = true;
			userSLD.symbolizer.Line.strokeWidth = userWidth;
			userSLD.symbolizer.Line.strokeColor = userColor;
			break;
		default:
			return;
		}
		var layerUniqueInfo = userSLD;
		var arrSLD = [{wmsName: wmsName, layerStyle: layerUniqueInfo}];
		var newSLD = { layers: wmsName, sld_body: this.createSLDFromParams(arrSLD)};
		layer.mergeNewParams(newSLD);
		layerModel.set({sld: layerUniqueInfo}); 
	};

	this.getBorderColor = function(fillColor){
		//calculate an appropriate border color
		var borderColor = {}; 
		borderColor.red = fillColor.slice(1,3);
		borderColor.green = fillColor.slice(3,5);
		borderColor.blue = fillColor.slice(5);
		for (var color in borderColor){
			//make the border color darker than the fill
			var tempColor = parseInt(borderColor[color], 16) - parseInt(0x50);
			if (tempColor < 0){
				//so we don't get any negative values for color
				tempColor = "00";
			} else {
				//convert to hex
				tempColor = tempColor.toString(16);
			}
			//check length;  the string should be 2 characters
			if (tempColor.length == 2){
				borderColor[color] = tempColor;
			} else if (tempColor.length == 1){
				borderColor[color] = '0' + tempColor;
			} else {
				borderColor[color] = '00';
			}
		}
		//reassemble the color string
		return "#" + borderColor.red + borderColor.green + borderColor.blue;
	};

	this.createSLDFromParams = function(arrUserParams){
		var userSLD = { namedLayers: []};
		for (var i in arrUserParams){
			var currentRule = new OpenLayers.Rule(arrUserParams[i].layerStyle);
			var currentStyle = new OpenLayers.Style("", {rules: [currentRule]});
			currentStyle = {
					name: arrUserParams[i].wmsName,
					userStyles: [currentStyle]
			};
			userSLD.namedLayers.push(currentStyle);
		}
		var newSLD = new OpenLayers.Format.SLD().write(userSLD);
		return newSLD;
	};

	this.hideLayer = function(layerId){
		console.log("Layer ID: "+layerId);
		var layers = this.getLayersBy("ogpLayerId", layerId);
		console.log("hiding layer");
		console.log(layers);

		for (var i in layers){
			layers[i].setVisibility(false);
		}
		
	};

	this.showLayer = function(layerId){
		var layers = this.getLayersBy("ogpLayerId", layerId);
			for (var i in layers){
				layers[i].setVisibility(true);
			}
	};

	this.getMapOffset = function(){
		var mapOffset = jQuery("#" + this.containerDiv).offset();
		var xOffset = 0;
		var leftCol$ = jQuery("#left_col");
		var leftColOffset = leftCol$.offset();
		if (leftCol$.is(":visible")){
			xOffset = leftCol$.width() + leftColOffset.left - mapOffset.left;
		}
		var yOffset = jQuery("#tabs").offset().top - mapOffset.top;

		return new OpenLayers.Pixel(xOffset, yOffset);
	};
	
	this.getVisibleExtent = function(){
		var topLeft =  this.getLonLatFromViewPortPx(this.getMapOffset());
		var fullExtent = this.getExtent();
		fullExtent.top = topLeft.lat;
		if (fullExtent.getWidth() >= 40075015.68){
			fullExtent.left = -20037508.34;
			fullExtent.right = 20037508.34;
		} else {
			fullExtent.left = topLeft.lon;
		}
		return fullExtent;
	};
	
	
	this.getGeodeticExtent = function(){
		var mercatorExtent = this.getVisibleExtent();
		var sphericalMercator = new OpenLayers.Projection('EPSG:900913');
		var geodetic = new OpenLayers.Projection('EPSG:4326');
		return mercatorExtent.transform(sphericalMercator, geodetic);
	};
	
	this.getSearchExtent = function(){
		this.updateSize();
		var rawExtent = this.getGeodeticExtent();
		return rawExtent;
	};

	this.getSearchCenter = function(){
		var sphericalMercator = new OpenLayers.Projection('EPSG:900913');
		var geodetic = new OpenLayers.Projection('EPSG:4326');
		var topLeft = this.getMapOffset(); 
		var width = jQuery(".olMap").width();
		var height = jQuery(".olMap").height();
		topLeft.x = topLeft.x + width/2;
		topLeft.y = topLeft.y - height/2;
		var center = this.getLonLatFromViewPortPx(topLeft);
		return center.transform(sphericalMercator, geodetic);
	};
	
	this.clipToWorld = function(bounds){
		return this.clipExtent(bounds, new OpenLayers.Bounds(-180, -90, 180, 90));
	};
	
	this.clipExtent = function(bounds, clipBounds){
		if (bounds.intersectsBounds(clipBounds)){
			var newExtent = new OpenLayers.Bounds();
			newExtent.left = Math.max(bounds.left, clipBounds.left);
			newExtent.top = Math.min(bounds.top, clipBounds.top);
			newExtent.right = Math.min(bounds.right, clipBounds.right);
			newExtent.bottom = Math.max(bounds.bottom, clipBounds.bottom);
			return newExtent;
		} else {
			throw new Error("The extents don't intersect");
		}
	};
	
	this.getFeatureInfoHandler = function(){
		var that = this;
		jQuery(document).on("map.getFeatureInfoOn", function(event, data){
			console.log("map.getFeatureInfoOn");
			var layerId = data.LayerId;
			console.log(layerId);
			var layers = that.getLayersBy("ogpLayerId", layerId);
			if (layers.length == 0){
				//layer is not in OpenLayers...
				throw new Error("This layer has not yet been previewed.  Please preview it first.");
			} else {
				that.events.register("click", layers[0], that.getFeatureAttributes);
			}
		});
		jQuery(document).on("map.getFeatureInfoOff", function(event, data){
			var layerId = data.LayerId;
			var layers = that.getLayersBy("ogpLayerId", layerId);
			if (layers.length == 0){
				//layer is not in OpenLayers...add it?
			} else {
				that.events.unregister("click", layers[0], that.getFeatureAttributes);
			}
		});
	};
	
	this.zoomToLayerExtentHandler = function(){
		var that = this;
		jQuery(document).on("map.zoomToLayerExtent", function(event, data){
			console.log(data);
			that.zoomToLayerExtent(data.bbox);
		});
	};
	
	this.adjustExtent = function(){
		var offset = this.getMapOffset();
		var fullMapHeight = jQuery('#' + this.mapDiv).height();
		var fullMapWidth = jQuery('#' + this.mapDiv).width();
		var adjust = {};
		adjust.x = (fullMapWidth - offset.x)/fullMapWidth;
		adjust.y = (fullMapHeight - offset.y)/fullMapHeight;
		return adjust;
	};
	
	this.zoomToLayerExtent = function(extent){
		var layerExtent = OpenLayers.Bounds.fromString(extent);
		var lowerLeft = this.WGS84ToMercator(layerExtent.left, layerExtent.bottom);
		var upperRight = this.WGS84ToMercator(layerExtent.right, layerExtent.top);
		

		var newExtent = new OpenLayers.Bounds();
		newExtent.extend(new OpenLayers.LonLat(lowerLeft.lon, lowerLeft.lat));
		newExtent.extend(new OpenLayers.LonLat(upperRight.lon, upperRight.lat));
		
		var size = newExtent.getSize();
		var adjustFactor = this.adjustExtent();
		var newWidth = size.w / adjustFactor.x;
		var newHeight = size.h / adjustFactor.y;
		
		var adjustedExtent = new OpenLayers.Bounds();
		var newWLon = Math.max(upperRight.lon - newWidth, -20037508.34);
		var newNLat = Math.min(lowerLeft.lat + newHeight, 20037508.34);
		var newELon = Math.min(upperRight.lon, 20037508.34);
		var newSLat = Math.max(lowerLeft.lat, -20037508.34);

		adjustedExtent.extend(new OpenLayers.LonLat(newWLon, newSLat));
		adjustedExtent.extend(new OpenLayers.LonLat(newELon, newNLat));
		console.log(newExtent);
		console.log(adjustedExtent);
		this.zoomToExtent(adjustedExtent);

	};

	this.getCombinedBounds = function(arrBounds){

		var newExtent = new OpenLayers.Bounds();
		for (var currentIndex in arrBounds){
			var currentBounds = arrBounds[currentIndex];
			newExtent.extend(currentBounds);
		}
		return newExtent;
	};

	this.getMaxLayerExtent = function getMaxLayerExtent(layerId){
		var bbox = this.previewed.get(layerId).get("bbox");
		var arrBbox = bbox.split(",");
		var newExtent = new OpenLayers.Bounds();

		newExtent.left = arrBbox[0];
		newExtent.right = arrBbox[2];
		newExtent.top = arrBbox[3];
		newExtent.bottom = arrBbox[1];
		return newExtent;
	};

	this.boundsToOLObject = function (model){
		var newExtent = new OpenLayers.Bounds();
		newExtent.left = model.get("MinX");
		newExtent.right = model.get("MaxX");
		newExtent.top = model.get("MaxY");
		newExtent.bottom = model.get("MinY");

		return newExtent;
	};

	this.getSpecifiedExtent = function getSpecifiedExtent(extentType, layerObj){
		//this code should be in mapDiv.js, since it has access to the openlayers object
		var extentArr = [];
		var maxExtentForLayers;
		if (extentType === "maxForLayers"){
			for (var indx in layerObj){

				var arrBbox = this.boundsToOLObject(layerObj[indx]);
				extentArr.push(arrBbox);
			}
			if (extentArr.length > 1){
				maxExtentForLayers = this.getCombinedBounds(extentArr).toBBOX();
			} else {
				maxExtentForLayers = extentArr[0].toBBOX();
			}
		}
		var extentMap = {"global": "-180,-85,180,85", "current": this.getGeodeticExtent().toBBOX(), 
				"maxForLayers": maxExtentForLayers};

		if(extentMap[extentType] != "undefined"){
			return extentMap[extentType];
		} else {
			throw new Exception('Extent type "' + extentType + '" is undefined.');
		}
	};
	
	this.previewBrowseGraphic = function(layerModel){
		var dialogHtml = '<img src="' + layerModel.get("parsedLocation").browseGraphic + '"/>';
		if (typeof jQuery('#browseGraphic')[0] == 'undefined'){
			var infoDiv = '<div id="browseGraphic" class="dialog">' + dialogHtml + '</div>';
			jQuery("body").append(infoDiv);
			jQuery("#browseGraphic").dialog({
				zIndex: 2999,
				title: "BROWSE GRAPHIC",
				width: 'auto',
				height: "auto",
				resizable: false,
				autoOpen: false
			});    	  
			jQuery("#browseGraphic").dialog('open');
		} else {
			jQuery("#browseGraphic").html(dialogHtml);
			jQuery("#browseGraphic").dialog('open');
		}
	};
	/*****
	 * main preview functions
	 */
	
	this.closeBrowseGraphic = function(layerId){
		jQuery("#browseGraphic").dialog('close');
		jQuery("#browseGraphic").html("");
	};
	
	this.getPreviewMethods =  function(){
		//order matters; should there be an order property?
		var previewMethods = [
	                        {type: "tilecache", onHandler: this.addWMSLayer, offHandler: this.hideLayer},
	                        {type: "wms", onHandler: this.addWMSLayer, offHandler: this.hideLayer},
	                        {type: "ArcGISRest", onHandler: this.addArcGISRestLayer, offHandler: this.hideLayer},
	                        {type: "browseGraphic", onHandler: this.previewBrowseGraphic, offHandler: this.closeBrowseGraphic},
	                        {type: "default", onHandler: this.addMapBBox, offHandler: this.hideLayer}
	                        ];
		return previewMethods;
	};
	
	this.previewOnDispatcher = function(location){
		var previewObj = this.getPreviewMethods();

		var defaultObj = null;
   		for (var i=0; i < previewObj.length; i++){
   			var currentObj = previewObj[i];
   	   		if (typeof location[currentObj.type] != "undefined"){
   	   			return currentObj;
   	   		} else if (currentObj.type === "default"){
   	   			defaultObj = currentObj;
   	   		}
   		}
   		
   		console.log("no preview type match");
		//there's no preview method identified, so just return a function that shows a static bounding box
		return defaultObj;
	};
	
	this.previewOffDispatcher = function(previewType){
		var previewObj = this.getPreviewMethods();

   		for (var i=0; i < previewObj.length; i++){
   			var currentObj = previewObj[i];
   	   		if (currentObj.type == previewType){
   	   			return currentObj.offHandler;
   	   		}	
   		}
   		
   		console.log("No preview type match for '" + previewType + "'");
		//there's no preview method identified, so just return a function that shows a static bounding box
		return this.hideLayer;
	};
	
	 
	this.getBboxFromCoords = function(minx, miny, maxx, maxy){
	    	var bbox = [];
  	    	bbox.push(minx);
  	    	bbox.push(miny);
  	    	bbox.push(maxx);
  	    	bbox.push(maxy);
  	    	bbox = bbox.join(",");
		return bbox;
	};
	
	this.previewLayerOn = function(layerId){
		//find preview method
		//TODO @asish
		console.log("LayerId: "+layerId);
		//TODO @asish

		var currModel = this.previewed.get(layerId);
		if (typeof currModel == "undefined"){
			throw new Error("Layer['" + layerId + "'] not found in PreviewedLayers collection.");
		}
		
		//TODO @asish
		var loc=currModel.get("Location");
		console.log("Location: "+loc);
		var location = jQuery.parseJSON(currModel.get("Location"));
		currModel.set({parsedLocation: location}); //perhaps this should happen on model add
		var previewHandler = null;
		var previewType = null;
		try {
			var previewObj = this.previewOnDispatcher(location);
			try {
				previewObj.onHandler.call(this, currModel);
			} catch (e){
				console.log(e);
				throw new Error("error in preview on handler.");
			}		
			//if no errors, set state for the layer
			previewType = previewObj.type;
			currModel.set({previewType: previewType});
        	analytics.track("Layer Previewed", currModel.get("Institution"), layerId);
		} catch (err){
			//if there's a problem, set preview to off, give the user a notice
			console.log("error in layer on");
			console.log(err);
			currModel.set({preview: "off"});
			throw new OpenGeoportal.ErrorObject(err,'Unable to Preview layer "' + currModel.get("LayerDisplayName") +'"');
		}

	};

	  
	this.previewLayerOff = function(layerId){
		//find preview off method
		var previewModel = this.previewed.get(layerId);
		var previewType = previewModel.get("previewType");
		var previewHandler = null;
		try {
			previewHandler = this.previewOffDispatcher(previewType);
			previewHandler.call(this, layerId);

		} catch (err){
			console.log("error in layer off");
			throw new OpenGeoportal.ErrorObject(err,'Unable to remove Previewed layer "' + previewModel.get("LayerDisplayName") +'"');
		}
		//if no errors, set state for the layer

		//previewModel.set({preview: "off"});
		// this.addToPreviewedLayers(rowData.node);//this should happen in the datatable
		//analytics.track("Layer Unpreviewed", dataObj["Institution"], layerId);

	};
	
};//object end
//set inheritance for MapController
OpenGeoportal.MapController.prototype = Object.create(OpenLayers.Map.prototype);
