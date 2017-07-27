var dynamicTemplateModule = angular.module('DynamicTemplate', []);

dynamicTemplateModule.directive('dynamicTemplate', function(DynamicTemplate){

	return {
		restrict:'A',
		link:function( scope, element, attr ){

			var deRegWatch, deRegArr = [], templateName, watchExpression, requestData;
			var deRegAttr = attr.$observe('dynamicTemplate', function( newValue, oldValue )
			{

				if( newValue != oldValue )
				{

					if( deRegWatch != undefined )
						deRegWatch();

					deRegWatch = scope.$watch(newValue, function(newWatchValue, oldWatchValue){
						if( newWatchValue != oldWatchValue || templateName == undefined )
						{
							templateName = newWatchValue;

							if( attr.$attr.dynamicTemplateWatchGroup != undefined )
								watchExpression = scope.$eval(attr.dynamicTemplateWatchGroup)

							if( attr.$attr.dynamicTemplateRequestData != undefined )
								requestData = scope.$eval(attr.dynamicTemplateRequestData)

							if( requestData != undefined )
							{
								requestData.templateName = templateName;
								templateName = requestData
							}

							DynamicTemplate.compileElement(templateName, element, scope, watchExpression );
						}
					}, true);
				}
			});

			deRegArr.push( deRegAttr );

			scope.$on('$destroy', function(){
				if( deRegWatch != undefined )
					deRegWatch();

				for (var i = 0; i < deRegArr.length; i++) {
					deRegArr[i]();
				}
			})

		}

	}
});

dynamicTemplateModule.factory('DynamicTemplate', function($templateCache, $templateRequest, $window, $compile, $sce){




    Element.prototype.remove = function() {
    	if( this.parentElement != null)
        	this.parentElement.removeChild(this);
    }

    NodeList.prototype.remove = HTMLCollection.prototype.remove = function() {
        for(var i = this.length - 1; i >= 0; i--) {
            if(this[i] && this[i].parentElement) {
                this[i].parentElement.removeChild(this[i]);
            }
        }
    }

	var dtProvider = this;
	dtProvider.config = {
		autoRequest:true,
		autoRequestUrl:'/recordTemplates'
	}


	function DTTemplate ( name, templateStr )
	{
		if( typeof(templateStr) != 'string' )
			throw 'DTTemplate cant construct without template string !';

		var dtTemplate = this;
		dtTemplate.name = name;
		dtTemplate.templateStr = templateStr;
		dtTemplate.templateElement = angular.element(document.createElement('templateContainer'));
		dtTemplate.templateElement.html(templateStr);
		dtTemplate.elementConditions = [];
		dtTemplate.compiledConditions = {}; // {1_2_23_43_53 : { compile:func, template:template}, ...}
		dtTemplate.compiledConditionMap = {}; // {conditionVariableName_conditionVariableValue:1_2_23_43_53, ...}
		dtTemplate.IF = 1;
		dtTemplate.ELSEIF = 2;
		dtTemplate.ELSE = 0;

		var templateElements = dtTemplate.templateElement.find("*");
		if( templateElements.length > 0 )
		{
			for( var i = 0; i < templateElements.length; i++ )
			{
				templateElements[i].index = i;
			}

			dtTemplate.elementConditions = indexConditions(templateElements[0]);
		}




		dtTemplate.getTemplateString = function( scope_or_conditionName, scopeWatchNames, beforeCompile, afterCompile )
		{

			if( scope_or_conditionName == undefined )
				return;

			if( typeof(scope_or_conditionName) == 'string' )
				return this.compiledConditions[this.compiledConditionMap[scope_or_conditionName]].template;
			else if ( typeof(scope_or_conditionName) == 'object' )
			{
				var compiledCondition = getCompiledCondition( scope_or_conditionName, scopeWatchNames, beforeCompile );

				if( compiledCondition != undefined )
					return compiledCondition.template;
			}
		}


		dtTemplate.getCompiledF = function( scope_or_conditionName, scopeWatchNames, beforeCompile, afterCompile )
		{

			if( scope_or_conditionName == undefined )
				return;

			if( typeof(scope_or_conditionName) == 'string' )
				return this.compiledConditions[this.compiledConditionMap[scope_or_conditionName]].compile;
			else if ( typeof(scope_or_conditionName) == 'object' )
			{
				var compiledCondition = getCompiledCondition( scope_or_conditionName, scopeWatchNames, beforeCompile );

				if( compiledCondition != undefined )
					return compiledCondition.compile;
			}
		}




		dtTemplate.createTemplateStr = function( scope, scopeWatchNames, conditionRemoveIndexes )
		{

			if( conditionRemoveIndexes == undefined )
				conditionRemoveIndexes = getRemoveIndexes( scope );

			var compiledConditionName = createCompiledConditionName( conditionRemoveIndexes ),
				compileCacheName = createConditionCacheName( scope, scopeWatchNames ),
				containerCopy = angular.copy(this.templateElement),
				elements = containerCopy.find("*");


			for (var i = 0; i < conditionRemoveIndexes.length; i++) {
				elements[conditionRemoveIndexes[i]].remove();
			}

			var templateStr = containerCopy.html();
			containerCopy.remove();
			delete containerCopy;


			return templateStr;
		}

		dtTemplate.compileCondition = function( templateStr, compiledConditionName, compileCacheName, beforeCompile, afterCompile )
		{

			if( templateStr == undefined || compiledConditionName == undefined )
				return;


			if( beforeCompile != undefined )
				templateStr = beforeCompile(templateStr);

			var compiledF = $compile(templateStr);


			if( afterCompile != undefined )
				templateStr = afterCompile(templateStr, compiledF);


			this.compiledConditions[compiledConditionName] = {template:templateStr, compile:compiledF};
			if( compileCacheName != undefined )
				this.compiledConditionMap[compileCacheName] = compiledConditionName;

			return compiledF;
		}


		//----- private FUNCTIONS
		function createConditionCacheName( scope, scopeWatchNames )
		{

			if( scope instanceof Object && scopeWatchNames instanceof Array)
			{
				var name = '';
				scopeWatchNames.sort();

				if( scopeWatchNames.length == 0 )
					return 'DEFAULT_CONDITION';

				for (var i = 0; i < scopeWatchNames.length; i++) {

					if( typeof(scope[scopeWatchNames[i]]) == 'object' )// obje içerisindeki value stringe çevirilirken kaybedilen zaman cachelemede kazanılan zamandan çok olacağı için obje referans kıyaslamalı şartlar cachelenmez.
						return;

					name += scopeWatchNames[i]+'_'+scope.$eval(scopeWatchNames[i])+'_';
				}

				return name;
			}

			//return 'DEFAULT_CONDITION';

		}

		function createCompiledConditionName( riArr )
		{

			if( riArr instanceof Array && riArr.length > 0 )
			{
				return riArr.join('_');
			}

			return 'DEFAULT_CONDITION';
		}

		function getRemoveIndexes( scope, conditionBlocks )
		{

			var removeIndexes = [];
			if( conditionBlocks == undefined )
				conditionBlocks = dtTemplate.elementConditions;

			for (var i = 0; i < conditionBlocks.length; i++) {
				var conditionBlock = conditionBlocks[i];

				var conditionIndex = dtTemplate.IF;
				var trueIndex = undefined;

				while ( true ) {
					var conditionObj = conditionBlock[conditionIndex];

					if( conditionObj == undefined ){
						if( conditionBlock[dtTemplate.ELSE] != undefined && trueIndex != undefined )
						{
							removeIndexes.push( conditionBlock[dtTemplate.ELSE].index );
						}

						break;
					}



					if( trueIndex != undefined )
					{
						removeIndexes.push( conditionObj.index );
						conditionIndex++;
						continue;
					}


					try
					{
						var result = scope.$eval(conditionObj.condition);
						if( result == true )
						{
							trueIndex = conditionObj.index;
							if( conditionObj.childConditions != undefined )
							{
								var childRemoveIndexes = getRemoveIndexes( scope, conditionObj.childConditions );
								if( childRemoveIndexes != undefined )
									removeIndexes = removeIndexes.concat(childRemoveIndexes);
							}
						}
						else
							removeIndexes.push( conditionObj.index );
					}
					catch(e)
					{
						console.log(e);
					}


					conditionIndex++;
				}
			}




			if( conditionBlocks == dtTemplate.elementConditions )
				removeIndexes.sort(function(a,b){return a-b;});

			return removeIndexes;
		}

		function indexConditions( element )
		{

			if( element != null )
			{
				var childConditions = [];
				if( element.children.length > 0 )
					childConditions = indexConditions(element.children[0]);

				var selfCondition = detectElementCondition( element ),
					sibling = element,
					dynamicConditionBlocks = [],
					dynamicConditionBlock = {},
					lastConditionIndex = dtTemplate.IF;

				if( selfCondition instanceof Object )
				{
					if( selfCondition.type == dtTemplate.IF )
					{
						dynamicConditionBlock[lastConditionIndex] = selfCondition;
						if( childConditions instanceof Array && childConditions.length > 0 )
							selfCondition.childConditions = childConditions;
						lastConditionIndex++;
					}
					else
					{
						selfCondition = undefined;
						dynamicConditionBlocks = childConditions;
					}

				}
				else if( childConditions instanceof Array && childConditions.length > 0 ){
					dynamicConditionBlocks = childConditions;
				}


				while( (sibling = sibling.nextElementSibling ) != null ){

					var siblingCondition = detectElementCondition( sibling ),
						siblingChildConditions = [];


					if( sibling.children.length > 0 )
						siblingChildConditions = indexConditions( sibling.children[0] );

					if( siblingCondition instanceof dynamicCondition )
					{

						if( siblingChildConditions instanceof Array && siblingChildConditions.length > 0 )
							siblingCondition.childConditions = siblingChildConditions;
						if( siblingCondition.type == dtTemplate.IF )
						{
							if( dynamicConditionBlock[dtTemplate.IF] instanceof dynamicCondition )
							{
								dynamicConditionBlocks.push(dynamicConditionBlock);
								dynamicConditionBlock = {};
								lastConditionIndex = dtTemplate.IF;
							}

							dynamicConditionBlock[lastConditionIndex] = siblingCondition;
							lastConditionIndex++;
						}
						else if( dynamicConditionBlock[dtTemplate.IF] instanceof dynamicCondition )
						{

							if( sibling.previousElementSibling.index == dynamicConditionBlock[lastConditionIndex - 1].index )
							{
								if( siblingCondition.type == dtTemplate.ELSEIF )
								{
									dynamicConditionBlock[lastConditionIndex] = siblingCondition;
									lastConditionIndex++;
								}
								else if( siblingCondition.type == dtTemplate.ELSE )
								{
									dynamicConditionBlock[dtTemplate.ELSE] = siblingCondition;
									dynamicConditionBlocks.push(dynamicConditionBlock);
									dynamicConditionBlock = {};
									lastConditionIndex = dtTemplate.IF;
								}
							}
							else
							{
								//console.log('Illegal If Block ! At : '+JSON.stringify(siblingCondition));//+" "+JSON.stringify(selfCondition);
							}
						}
						else
						{
							//console.log('Illegal If Block ! At : '+JSON.stringify(siblingCondition));//+" "+JSON.stringify(selfCondition);
						}
					}
					else if( siblingChildConditions instanceof Array &&  siblingChildConditions.length > 0 )
						dynamicConditionBlocks = dynamicConditionBlocks.concat(siblingChildConditions);


				}


				if( dynamicConditionBlock[dtTemplate.IF] instanceof dynamicCondition )
				{
					dynamicConditionBlocks.push(dynamicConditionBlock);
				}

				return dynamicConditionBlocks;
			}


		}

		function detectElementCondition( element )
		{
			if( element != null && element != undefined && element.attributes != undefined)
			{
				var condition = undefined;
				for ( var j = element.attributes.length-1; j >= 0; j-- )
				{

					if ( element.attributes[j].name.indexOf('dynamic-template-if') == 0 )
						condition =  new dynamicCondition( element.index, element.attributes[j].value, dtTemplate.IF)
					else if ( element.attributes[j].name.indexOf('dynamic-template-else-if') == 0 )
						condition = new dynamicCondition( element.index, element.attributes[j].value, dtTemplate.ELSEIF)
					else if ( element.attributes[j].name.indexOf('dynamic-template-else') == 0 )
						condition = new dynamicCondition( element.index, '', dtTemplate.ELSE)


					if( condition != undefined )
					{
						if( condition.type == dtTemplate.IF )
							element.removeAttribute("dynamic-template-if");
						else if( condition.type == dtTemplate.ELSEIF )
							element.removeAttribute("dynamic-template-else-if");
						else if( condition.type == dtTemplate.ELSE )
							element.removeAttribute("dynamic-template-else");

						return condition;
					}
				}
			}
		}

		function getCompiledCondition( scope, scopeWatchNames, beforeCompile, afterCompile )
		{
			var conditionCacheName = createConditionCacheName( scope, scopeWatchNames, beforeCompile, afterCompile );

			if( conditionCacheName != undefined && dtTemplate.compiledConditionMap[conditionCacheName] != undefined )
				return dtTemplate.compiledConditions[dtTemplate.compiledConditionMap[conditionCacheName]]

			var removeIndexes = getRemoveIndexes( scope ),
				compiledConditionName = createCompiledConditionName( removeIndexes );

			if( dtTemplate.compiledConditions[compiledConditionName] != undefined )
			{
				dtTemplate.compiledConditionMap[conditionCacheName] = compiledConditionName;
				return dtTemplate.compiledConditions[compiledConditionName];
			}

			var templateStr = dtTemplate.createTemplateStr( scope, scopeWatchNames, removeIndexes);
			dtTemplate.compileCondition( templateStr, compiledConditionName, conditionCacheName, beforeCompile, afterCompile );

			return dtTemplate.compiledConditions[compiledConditionName];
		}




		//---------private classes
		function dynamicCondition(index, condition, type){
			if( index == undefined || index == null || condition == undefined || condition == null || type == undefined || type == null )
				throw 'dynamicCondition Illegal Argument ! : Index : '+index+" Condition : "+condition+" Type : "+type;

			this.index = index;
			this.condition = condition;
			this.type = type;
		}

	}

    var templates = {};

    function DynamicTemplate()
	{

    	var dynamicTemp = this;

        dynamicTemp.store = $templateCache;
        dynamicTemp.req = $templateRequest;
        dynamicTemp.templateRequestUrl = dtProvider.config.autoRequestUrl;
        dynamicTemp.pendingDownloads = [];
        dynamicTemp.pendingDownloadPromises = {};
		dynamicTemp.config = dtProvider.config;

        dynamicTemp.setTemplateRequestUrl = function( url )
		{
			this.templateRequestUrl = url;
		};

        dynamicTemp.downloadTemplate = function ( templateName, getParams, successCallBack, errorCallBack )
		{
            var promise = requestTemplate( templateName, getParams);

            promise
                .then(function(response){
                    if( response != undefined )
                    {
                        if( typeof successCallBack == 'function' )
                        	successCallBack();
                    }
                    else if( typeof errorCallBack == 'function' )
                    	errorCallBack();

                })
                .catch(function(e)
                {
                    if( typeof errorCallBack == 'function' )
                    	errorCallBack(e);
                    console.log(e);
                });

            return promise;
        };

		dynamicTemp.createSaveDTTemplate = function( templateName, templateStr )
		{
			if( templateName == undefined || templateStr == undefined )
				return;

			var dtTemplate = new DTTemplate(templateName, templateStr);

			if( !( dtTemplate instanceof DTTemplate )  )
				throw 'IllegalArgument: DTTemplate must be given !';

			setDTTemplate( dtTemplate );
		};

		dynamicTemp.compileElement = function(templateName, element, parentScope, scopeWatchNames, beforeCompile, afterCompile )
		{


				if( templateName == undefined || element == undefined || parentScope == undefined || ( scopeWatchNames instanceof Array && scopeWatchNames.length <= 0 ))
					return;

				var self_ = this;

				element.empty();
				
				var dtTemplate = getDTTemplate( templateName ),
				 	newScope = parentScope.$new(),
					compileElement = function(){



					if( dtTemplate == undefined )
						dtTemplate = getDTTemplate( templateName );


					var linkFunct = dtTemplate.getCompiledF( parentScope, scopeWatchNames, beforeCompile, afterCompile );





		            linkFunct(newScope, function(clonedElement, scope){

		                element.html(clonedElement);

						var deRegArr = [];
						if( scopeWatchNames != undefined )
						{

							var deReg = scope.$watchGroup(scopeWatchNames, function( newValues, oldValues){

								if( newValues == oldValues )
									return;

								for (var i = 0; i < newValues.length; i++) {
									if( newValues[i] != oldValues[i] )
									{
										for (var i = 0; i < deRegArr.length; i++) {
											deRegArr[i]();
										}

										self_.compileElement(templateName, element, parentScope, scopeWatchNames, beforeCompile, afterCompile);


										break;
									}
								}
							});
							deRegArr.push(deReg);

						}

						scope.$on('$destroy', function(){

							for (var i = 0; i < deRegArr.length; i++) {
								deRegArr[i]();
							}
							clonedElement.empty();
						});


		                clonedElement.on('$destroy', function(){
							clonedElement.off('$destroy');
							scope.$evalAsync('$destroy()');
		                });

		            });

				};


			if( typeof dtTemplate == 'object' )
			{
			  compileElement();
			}
			else if( dtTemplate == undefined )
			{

				var storedTemplateStr = self_.store.get(templateName);
				if( storedTemplateStr != undefined )
				{
					self_.createSaveDTTemplate( templateName, storedTemplateStr );
					compileElement();
				}
				else if( dtProvider.config.autoRequest == true )
				{
					var getParams = undefined;

					if( templateName instanceof Object )
					{
						getParams = angular.copy(templateName);
						templateName = templateName.templateName;
						delete getParams.templateName;
					}
					
					self_.downloadTemplate(templateName, getParams, function(){
						compileElement();
					});
				}

			}

			return newScope;
		}



		//-----------------------------------------------------------------------------------

		function requestTemplate( templateName, getParams )
		{
			var url = dynamicTemp.templateRequestUrl;

			if( getParams instanceof Object )
			{
				url += '?';
				var params = Object.keys( getParams );
				for (var i = 0; i < params.length; i++) {
					url+= params[i] + '=' + getParams[params[i]];
					if( i < params.length-1 )
						url += '&';
				}
			}
			else
				url += templateName;

			if( dynamicTemp.pendingDownloads.indexOf(url) == -1 )
			{
                dynamicTemp.pendingDownloads.push(url);
                dynamicTemp.pendingDownloadPromises[url] = dynamicTemp.req( url );
                dynamicTemp.pendingDownloadPromises[url].url = url;
                dynamicTemp.pendingDownloadPromises[url].then(function(response){
				try {

					dynamicTemp.pendingDownloads.splice( dynamicTemp.pendingDownloads.indexOf(url), 1 );
					dynamicTemp.pendingDownloadPromises[url] = undefined;
					dynamicTemp.store.put( templateName, response);
					dynamicTemp.createSaveDTTemplate( templateName, response );
				}catch(e)
				{
					console.log(e)
				}
				});
			}

            return dynamicTemp.pendingDownloadPromises[url];
		};

        function getTemplates()
		{
            return templates;
        };

        function getDTTemplate( dtTempName )
        {
            return getTemplates()[dtTempName];
        };

        function setDTTemplate( dtTemp )
        {
        	if( dtTemp instanceof DTTemplate )
            	templates[dtTemp.name] = dtTemp;

        };
    }


    return new DynamicTemplate();
})
