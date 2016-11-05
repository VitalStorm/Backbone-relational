QUnit.module( "Backbone.Relational.Model", { setup: require('./setup/data') } );

	QUnit.test( "Return values: set returns the Model", function() {
		var personId = 'person-10';
		var person = new Person({
			id: personId,
			name: 'Remi',
			resource_uri: personId
		});

		var result = person.set( { 'name': 'Hector' } );
		ok( result === person, "Set returns the model" );
	});

	QUnit.test( "`clear`", function() {
		var person = new Person( { id: 'person-10' } );

		ok( person === Person.findOrCreate( 'person-10' ) );

		person.clear();

		ok( !person.id );

		ok( !Person.findOrCreate( 'person-10' ) );

		person.set( { id: 'person-10' } );

		ok( person === Person.findOrCreate( 'person-10' ) );
	});

	QUnit.test( "getRelations", function() {
		var relations = person1.getRelations();

		equal( relations.length, 6 );

		ok( _.every( relations, function( rel ) {
				return rel instanceof Backbone.Relational.Relation;
			})
		);
	});

	QUnit.test( "getRelation", function() {
		var userRel = person1.getRelation( 'user' );

		ok( userRel instanceof Backbone.Relational.HasOne );
		equal( userRel.key, 'user' );

		var jobsRel = person1.getRelation( 'jobs' );

		ok( jobsRel instanceof Backbone.Relational.HasMany );
		equal( jobsRel.key, 'jobs' );

		ok( person1.getRelation( 'nope' ) == null );
	});

	QUnit.test( "getAsync on a HasOne relation", function() {
		var errorCount = 0;
		var person = new Person({
			id: 'person-10',
			resource_uri: 'person-10',
			user: 'user-10'
		});

		var idsToFetch = person.getIdsToFetch( 'user' );
		deepEqual( idsToFetch, [ 'user-10' ] );

		var request = person.getAsync( 'user', { error: function() {
				errorCount++;
			}
		});

		ok( _.isObject( request ) && request.always && request.done && request.fail );
		equal( window.requests.length, 1, "A single request has been made" );
		ok( person.get( 'user' ) instanceof User );

		// Triggering the 'error' callback should destroy the model
		window.requests[ 0 ].error();
		// Trigger the 'success' callback on the `destroy` call to actually fire the 'destroy' event
		_.last( window.requests ).success();

		ok( !person.get( 'user' ), "User has been destroyed & removed" );
		equal( errorCount, 1, "The error callback executed successfully" );

		var person2 = new Person({
			id: 'person-11',
			resource_uri: 'person-11'
		});

		request = person2.getAsync( 'user' );
		equal( window.requests.length, 1, "No request was made" );
	});

	QUnit.test( "getAsync on a HasMany relation", function() {
		var errorCount = 0;
		var zoo = new Zoo({
			animals: [ { id: 'monkey-1' }, 'lion-1', 'zebra-1' ]
		});

		var idsToFetch = zoo.getIdsToFetch( 'animals' );
		deepEqual( idsToFetch, [ 'lion-1', 'zebra-1' ] );

		/**
		 * Case 1: separate requests for each model
		 */
		window.requests = [];

		// `getAsync` creates two placeholder models for the ids present in the relation.
		var request = zoo.getAsync( 'animals', { error: function() { errorCount++; } } );

		ok( _.isObject( request ) && request.always && request.done && request.fail );
		equal( window.requests.length, 2, "Two requests have been made (a separate one for each animal)" );
		equal( zoo.get( 'animals' ).length, 3, "Three animals in the zoo" );

		// Triggering the 'error' callback for one request should destroy the model
		window.requests[ 0 ].error();
		// Trigger the 'success' callback on the `destroy` call to actually fire the 'destroy' event
		_.last( window.requests ).success();

		equal( zoo.get( 'animals' ).length, 2, "Two animals left in the zoo" );
		equal( errorCount, 1, "The error callback executed successfully" );

		// Try to re-fetch; nothing left to get though, since the placeholder models got destroyed
		window.requests = [];
		request = zoo.getAsync( 'animals' );

		equal( window.requests.length, 0, "No request" );
		equal( zoo.get( 'animals' ).length, 2, "Two animals" );

		/**
		 * Case 2: one request per fetch (generated by the collection)
		 */
		window.requests = [];
		errorCount = 0;

		// Define a `url` function for the zoo that builds a url to fetch a set of models from their ids
		zoo.get( 'animals' ).url = function( models ) {
			var ids = _.map( models || [], function( model ) {
				return model instanceof Backbone.Model ? model.id : model;
			} );

			return '/animal/' + ( ids.length ? 'set/' + ids.join( ';' ) + '/' : '' );
		};

		// Set two new animals to be fetched; both should be fetched in a single request.
		zoo.set( { animals: [ 'monkey-1', 'lion-2', 'zebra-2' ] } );

		equal( zoo.get( 'animals' ).length, 1, "One animal" );

		// `getAsync` should not create placeholder models in this case, since the custom `url` function
		// can return a url for the whole set without needing to resort to this.
		window.requests = [];
		request = zoo.getAsync( 'animals', { error: function() { errorCount++; } } );

		ok( _.isObject( request ) && request.always && request.done && request.fail );
		equal( window.requests.length, 1, "One request" );
		equal( _.last( window.requests ).url, '/animal/set/lion-2;zebra-2/' );
		equal( zoo.get('animals').length, 1, "Still only one animal in the zoo" );

		// Triggering the 'error' callback (some error occured during fetching) should trigger the 'destroy' event
		// on both fetched models, but should NOT actually make 'delete' requests to the server!
		_.last( window.requests ).error();
		equal( window.requests.length, 1, "An error occured when fetching, but no DELETE requests are made to the server while handling local cleanup." );

		equal( zoo.get( 'animals' ).length, 1, "Both animals are destroyed" );
		equal( errorCount, 1, "The error callback executed successfully" );

		// Try to re-fetch; attempts to get both missing animals again
		window.requests = [];
		request = zoo.getAsync( 'animals' );

		equal( window.requests.length, 1, "One request" );
		equal( zoo.get( 'animals' ).length, 1, "One animal" );

		// In this case, models are only created after receiving data for them
		window.requests[ 0 ].success( [ { id: 'lion-2' }, { id: 'zebra-2' } ] );
		equal( zoo.get( 'animals' ).length, 3 );

		// Re-fetch the existing models
		window.requests = [];
		request = zoo.getAsync( 'animals', { refresh: true } );

		equal( window.requests.length, 1 );
		equal( _.last( window.requests ).url, '/animal/set/monkey-1;lion-2;zebra-2/' );
		equal( zoo.get( 'animals' ).length, 3 );

		// An error while refreshing existing models shouldn't affect it
		window.requests[ 0 ].error();
		equal( zoo.get( 'animals' ).length, 3 );
	});

	QUnit.test( "getAsync", 8, function() {
		var zoo = Zoo.findOrCreate( { id: 'z-1', animals: [ 'cat-1' ] } );

		zoo.on( 'add:animals', function( animal ) {
			console.log( 'add:animals=%o', animal );
			animal.on( 'change:favoriteFood', function( model, food ) {
				console.log( '%s eats %s', animal.get( 'name' ), food.get( 'name' ) );
			});
		});

		zoo.getAsync( 'animals' ).done( function( animals ) {
			ok( animals instanceof AnimalCollection );
			ok( animals.length === 1 );

			var cat = zoo.get( 'animals' ).at( 0 );
			equal( cat.get( 'name' ), 'Tiger' );

			cat.getAsync( 'favoriteFood' ).done( function( food ) {
				equal( food.get( 'name' ), 'Cheese', 'Favorite food is cheese' );
			});
		});

		equal( zoo.get( 'animals' ).length, 1 );
		equal( window.requests.length, 1 );
		equal( _.last( window.requests ).url, '/animal/cat-1' );

		// Declare success
		_.last( window.requests ).respond( 200, { id: 'cat-1', name: 'Tiger', favoriteFood: 'f-2' } );
		equal( window.requests.length, 2 );

		_.last( window.requests ).respond( 200, { id: 'f-2', name: 'Cheese' } );
	});

	QUnit.test( "autoFetch a HasMany relation", function() {
		var shopOne = new Shop({
			id: 'shop-1',
			customers: ['customer-1', 'customer-2']
		});

		equal( requests.length, 2, "Two requests to fetch the users has been made" );
		requests.length = 0;

		var shopTwo = new Shop({
			id: 'shop-2',
			customers: ['customer-1', 'customer-3']
		});

		equal( requests.length, 1, "A request to fetch a user has been made" ); //as customer-1 has already been fetched
	});

	QUnit.test( "autoFetch on a HasOne relation (with callbacks)", function() {
		var shopThree = new Shop({
			id: 'shop-3',
			address: 'address-3'
		});

		equal( requests.length, 1, "A request to fetch the address has been made" );

		var res = { successOK: false, errorOK: false };

		requests[0].success( res );
		equal( res.successOK, true, "The success() callback has been called" );
		requests.length = 0;

		var shopFour = new Shop({
			id: 'shop-4',
			address: 'address-4'
		});

		equal( requests.length, 1, "A request to fetch the address has been made" );
		requests[0].error( res );
		equal( res.errorOK, true, "The error() callback has been called" );
	});

	QUnit.test( "autoFetch false by default", function() {
		var agentOne = new Agent({
			id: 'agent-1',
			customers: ['customer-4', 'customer-5']
		});

		equal( requests.length, 0, "No requests to fetch the customers has been made as autoFetch was not defined" );

		agentOne = new Agent({
			id: 'agent-2',
			address: 'address-5'
		});

		equal( requests.length, 0, "No requests to fetch the customers has been made as autoFetch was set to false" );
	});

	QUnit.test( "`clone`", function() {
		var user = person1.get( 'user' );

		// HasOne relations should stay with the original model
		var newPerson = person1.clone();

		ok( newPerson.get( 'user' ) === null );
		ok( person1.get( 'user' ) === user );
	});

	QUnit.test( "`save` (with `wait`)", function() {
		var node1 = new Node({ id: '1', parent: '3', name: 'First node' } ),
			node2 = new Node({ id: '2', name: 'Second node' });

		// Set node2's parent to node1 in a request with `wait: true`
		var request = node2.save( 'parent', node1, { wait: true } ),
			json = JSON.parse( request.data );

		ok( _.isObject( json.parent ) );
		equal( json.parent.id, '1' );
		equal( node2.get( 'parent' ), null );

		request.success();

		equal( node2.get( 'parent' ), node1 );

		// Save a new node as node2's parent, only specified as JSON in the call to save
		request = node2.save( 'parent', { id: '3', parent: '2', name: 'Third node' }, { wait: true } );
		json = JSON.parse( request.data );

		ok( _.isObject( json.parent ) );
		equal( json.parent.id, '3' );
		equal( node2.get( 'parent' ), node1 );

		request.success();

		var node3 = node2.get( 'parent' );

		ok( node3 instanceof Node );
		equal( node3.id, '3' );

		// Try to reset node2's parent to node1, but fail the request
		request = node2.save( 'parent', node1, { wait: true } );
		request.error();

		equal( node2.get( 'parent' ), node3 );

		// See what happens for different values of `includeInJSON`...
		// For `Person.user`, just the `idAttribute` should be serialized to the keyDestination `user_id`
		var user1 = person1.get( 'user' );
		request = person1.save( 'user', null, { wait: true } );
		json = JSON.parse( request.data );
		console.log( request, json );

		equal( person1.get( 'user' ), user1 );

		request.success( json );

		equal( person1.get( 'user' ), null );

		request = person1.save( 'user', user1, { wait: true } );
		json = JSON.parse( request.data );

		equal( json.user_id, user1.id );
		equal( person1.get( 'user' ), null );

		request.success( json );

		equal( person1.get( 'user' ), user1 );

		// Save a collection with `wait: true`
		var zoo = new Zoo( { id: 'z1' } ),
			animal1 = new Animal( { id: 'a1', species: 'Goat', name: 'G' } ),
			coll = new Backbone.Relational.Collection( [ { id: 'a2', species: 'Rabbit', name: 'R' }, animal1 ] );

		request = zoo.save( 'animals', coll, { wait: true } );
		json = JSON.parse( request.data );
		console.log( request, json );

		ok( zoo.get( 'animals' ).length === 0 );

		request.success( json );

		ok( zoo.get( 'animals' ).length === 2 );
		console.log( animal1 );
	});

	QUnit.test( "`Collection.create` (with `wait`)", function() {
		var nodeColl = new NodeList(),
			nodesAdded = 0;

		nodeColl.on( 'add', function( model, collection, options ) {
			nodesAdded++;
		});

		nodeColl.create({ id: '3', parent: '2', name: 'Third node' }, { wait: true });
		ok( nodesAdded === 0 );
		requests[ requests.length - 1 ].success();
		ok( nodesAdded === 1 );

		nodeColl.create({ id: '4', name: 'Third node' }, { wait: true });
		ok( nodesAdded === 1 );
		requests[ requests.length - 1 ].error();
		ok( nodesAdded === 1 );
	});

	QUnit.test( "`toJSON`: simple cases", function() {
		var node = new Node({ id: '1', parent: '3', name: 'First node' });
		new Node({ id: '2', parent: '1', name: 'Second node' });
		new Node({ id: '3', parent: '2', name: 'Third node' });

		var json = node.toJSON();

		ok( json.children.length === 1 );
	});

	QUnit.test("'toJSON' should return null for relations that are set to null, even when model is not fetched", function() {
		var person = new Person( { user : 'u1' } );

		equal( person.toJSON().user_id, 'u1' );
		person.set( 'user', null );
		equal( person.toJSON().user_id, null );

		person = new Person( { user: new User( { id : 'u2' } ) } );

		equal( person.toJSON().user_id, 'u2' );
		person.set( { user: 'unfetched_user_id' } );
		equal( person.toJSON().user_id, 'unfetched_user_id' );
	});

	QUnit.test( "`toJSON` should include ids for 'unknown' or 'missing' models (if `includeInJSON` is `idAttribute`)", function() {
		// See GH-191

		// `Zoo` shouldn't be affected; `animals.includeInJSON` is not equal to `idAttribute`
		var zoo = new Zoo({ id: 'z1', animals: [ 'a1', 'a2' ] }),
			zooJSON = zoo.toJSON();

		ok( _.isArray( zooJSON.animals ) );
		equal( zooJSON.animals.length, 0, "0 animals in zooJSON; it serializes an array of attributes" );

		var a1 = new Animal( { id: 'a1' } );
		zooJSON = zoo.toJSON();
		equal( zooJSON.animals.length, 1, "1 animals in zooJSON; it serializes an array of attributes" );

		// Agent -> Customer; `idAttribute` on a HasMany
		var agent = new Agent({ id: 'a1', customers: [ 'c1', 'c2' ] } ),
			agentJSON = agent.toJSON();

		ok( _.isArray( agentJSON.customers ) );
		equal( agentJSON.customers.length, 2, "2 customers in agentJSON; it serializes the `idAttribute`" );

		var c1 = new Customer( { id: 'c1' } );
		equal( agent.get( 'customers' ).length, 1, '1 customer in agent' );

		agentJSON = agent.toJSON();
		equal( agentJSON.customers.length, 2, "2 customers in agentJSON; `idAttribute` for 1 missing, other existing" );

		//c1.destroy();

		//agentJSON = agent.toJSON();
		//equal( agentJSON.customers.length, 1, "1 customer in agentJSON; `idAttribute` for 1 missing, other destroyed" );

		agent.set( 'customers', [ 'c1', 'c3' ] );
		var c3 = new Customer( { id: 'c3' } );

		agentJSON = agent.toJSON();
		equal( agentJSON.customers.length, 2, "2 customers in agentJSON; 'c1' already existed, 'c3' created" );

		agent.get( 'customers' ).remove( c1 );

		agentJSON = agent.toJSON();
		equal( agentJSON.customers.length, 1, "1 customer in agentJSON; 'c1' removed, 'c3' still in there" );

		// Person -> User; `idAttribute` on a HasOne
		var person = new Person({ id: 'p1', user: 'u1' } ),
			personJSON = person.toJSON();

		equal( personJSON.user_id, 'u1', "`user_id` gets set in JSON" );

		var u1 = new User( { id: 'u1' } );
		personJSON = person.toJSON();
		ok( u1.get( 'person' ) === person );
		equal( personJSON.user_id, 'u1', "`user_id` gets set in JSON" );

		person.set( 'user', 'u1' );
		personJSON = person.toJSON();
		equal( personJSON.user_id, 'u1', "`user_id` gets set in JSON" );

		u1.destroy();
		personJSON = person.toJSON();
		ok( !u1.get( 'person' ) );
		equal( personJSON.user_id, 'u1', "`user_id` still gets set in JSON" );
	});

	QUnit.test( "`toJSON` should include ids for unregistered models (if `includeInJSON` is `idAttribute`)", function() {

		// Person -> User; `idAttribute` on a HasOne
		var person = new Person({ id: 'p1', user: 'u1' } ),
			personJSON = person.toJSON();

		equal( personJSON.user_id, 'u1', "`user_id` gets set in JSON even though no user obj exists" );

		var u1 = new User( { id: 'u1' } );
		personJSON = person.toJSON();
		ok( u1.get( 'person' ) === person );
		equal( personJSON.user_id, 'u1', "`user_id` gets set in JSON after matching user obj is created" );

		Backbone.Relational.store.unregister(u1);

		personJSON = person.toJSON();
		equal( personJSON.user_id, 'u1', "`user_id` gets set in JSON after user was unregistered from store" );
	});

	QUnit.test( "`parse` gets called through `findOrCreate`", function() {
		var parseCalled = 0;
		Zoo.prototype.parse = Animal.prototype.parse = function( resp, options ) {
			parseCalled++;
			return resp;
		};

		var zoo = Zoo.findOrCreate({
			id: '1',
			name: 'San Diego Zoo',
			animals: [ { id: 'a' } ]
		}, { parse: true } );
		var animal = zoo.get( 'animals' ).first();

		ok( animal.get( 'livesIn' ) );
		ok( animal.get( 'livesIn' ) instanceof Zoo );
		ok( animal.get( 'livesIn' ).get( 'animals' ).get( animal ) === animal );

		// `parse` gets called by `findOrCreate` directly when trying to lookup `1`,
		// and the parsed attributes are passed to `build` (called from `findOrCreate`) with `{ parse: false }`,
		// rather than having `parse` called again by the Zoo constructor.
		ok( parseCalled === 1, 'parse called 1 time? ' + parseCalled );

		parseCalled = 0;

		animal = new Animal({ id: 'b' });
		animal.set({
			id: 'b',
			livesIn: {
				id: '2',
				name: 'San Diego Zoo',
				animals: [ 'b' ]
			}
		}, { parse: true } );

		ok( animal.get( 'livesIn' ) );
		ok( animal.get( 'livesIn' ) instanceof Zoo );
		ok( animal.get( 'livesIn' ).get( 'animals' ).get( animal ) === animal );

		ok( parseCalled === 0, 'parse called 0 times? ' + parseCalled );

		// Reset `parse` methods
		Zoo.prototype.parse = Animal.prototype.parse = Backbone.Relational.Model.prototype.parse;
	});

	QUnit.test( "`Collection#parse` with RelationalModel simple case", function() {
		var Contact = Backbone.Relational.Model.extend({
			parse: function( response ) {
				response.bar = response.foo * 2;
				return response;
			}
		});
		var Contacts = Backbone.Relational.Collection.extend({
			model: Contact,
			url: '/contacts',
			parse: function( response ) {
				return response.items;
			}
		});

		var contacts = new Contacts();
		contacts.fetch({
			// fake response for testing
			response: {
				status: 200,
				responseText: { items: [ { foo: 1 }, { foo: 2 } ] }
			}
		});

		equal( contacts.length, 2, 'Collection response was fetched properly' );
		var contact = contacts.first();
		ok( contact , 'Collection has a non-null item' );
		ok( contact instanceof Contact, '... of the type type' );
		equal( contact.get('foo'), 1, '... with correct fetched value' );
		equal( contact.get('bar'), 2, '... with correct parsed value' );
	});

	QUnit.test( "By default, `parse` should only get called on top-level objects; not for nested models and collections", function() {
		var companyData = {
			'data': {
				'id': 'company-1',
				'contacts': [
					{
						'id': '1'
					},
					{
						'id': '2'
					}
				]
			}
		};

		var Contact = Backbone.Relational.Model.extend();
		var Contacts = Backbone.Relational.Collection.extend({
			model: Contact
		});

		var Company = Backbone.Relational.Model.extend({
			urlRoot: '/company/',
			relations: [{
				type: Backbone.Relational.HasMany,
				key: 'contacts',
				relatedModel: Contact,
				collectionType: Contacts
			}]
		});

		var parseCalled = 0;
		Company.prototype.parse = Contact.prototype.parse = Contacts.prototype.parse = function( resp, options ) {
			parseCalled++;
			return resp.data || resp;
		};

		var company = new Company( companyData, { parse: true } ),
			contacts = company.get( 'contacts' ),
			contact = contacts.first();

		ok( company.id === 'company-1' );
		ok( contact && contact.id === '1', 'contact exists' );
		ok( parseCalled === 1, 'parse called 1 time? ' + parseCalled );

		// simulate what would happen if company.fetch() was called.
		company.fetch({
			parse: true,
			response: {
				status: 200,
				responseText: _.clone( companyData )
			}
		});

		ok( parseCalled === 2, 'parse called 2 times? ' + parseCalled );

		ok( contacts === company.get( 'contacts' ), 'contacts collection is same instance after fetch' );
		equal( contacts.length, 2, '... with correct length' );
		ok( contact && contact.id === '1', 'contact exists' );
		ok( contact === contacts.first(), '... and same model instances' );
	});

	QUnit.test( "constructor.findOrCreate", function() {
		var personColl = Backbone.Relational.store.getCollection( person1 ),
			origPersonCollSize = personColl.length;

		// Just find an existing model
		var person = Person.findOrCreate( person1.id );

		ok( person === person1 );
		ok( origPersonCollSize === personColl.length, "Existing person was found (none created)" );

		// Update an existing model
		person = Person.findOrCreate( { id: person1.id, name: 'dude' } );

		equal( person.get( 'name' ), 'dude' );
		equal( person1.get( 'name' ), 'dude' );

		ok( origPersonCollSize === personColl.length, "Existing person was updated (none created)" );

		// Look for a non-existent person; 'options.create' is false
		person = Person.findOrCreate( { id: 5001 }, { create: false } );

		ok( !person );
		ok( origPersonCollSize === personColl.length, "No person was found (none created)" );

		// Create a new model
		person = Person.findOrCreate( { id: 5001 } );

		ok( person instanceof Person );
		ok( origPersonCollSize + 1 === personColl.length, "No person was found (1 created)" );

		// Find when options.merge is false
		person = Person.findOrCreate( { id: person1.id, name: 'phil' }, { merge: false } );

		equal( person.get( 'name' ), 'dude' );
		equal( person1.get( 'name' ), 'dude' );
	});

	QUnit.test( "constructor.find", function() {
		var personColl = Backbone.Relational.store.getCollection( person1 ),
		origPersonCollSize = personColl.length;

		// Look for a non-existent person
		person = Person.find( { id: 5001 } );
		ok( !person );
	});

	QUnit.test( "change events in relation can use changedAttributes properly", function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );

		scope.PetAnimal = Backbone.Relational.Model.extend({
			subModelTypes: {
				'cat': 'Cat',
				'dog': 'Dog'
			}
		});
		scope.Dog = scope.PetAnimal.extend();
		scope.Cat = scope.PetAnimal.extend();

		scope.PetOwner = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key: 'pets',
				relatedModel: scope.PetAnimal,
				reverseRelation: {
					key: 'owner'
				}
			}]
		});

		var owner = new scope.PetOwner( { id: 'owner-2354' } );
		var animal = new scope.Dog( { type: 'dog', id: '238902', color: 'blue' } );
		equal( animal.get('color'), 'blue', 'animal starts out blue' );

		var changes = 0, changedAttrs = null;
		animal.on('change', function(model, options) {
			changes++;
			changedAttrs = model.changedAttributes();
		});

		animal.set( { color: 'green' } );
		equal( changes, 1, 'change event gets called after animal.set' );
		equal( changedAttrs.color, 'green', '... with correct properties in "changedAttributes"' );

		owner.set(owner.parse({
			id: 'owner-2354',
			pets: [ { id: '238902', type: 'dog', color: 'red' } ]
		}));

		equal( animal.get('color'), 'red', 'color gets updated properly' );
		equal( changes, 2, 'change event gets called after owner.set' );
		equal( changedAttrs.color, 'red', '... with correct properties in "changedAttributes"' );
	});

	QUnit.test( 'change events should not fire on new items in Collection#set', function() {
		var modelChangeEvents = 0,
			collectionChangeEvents = 0;

		var Animal2 = Animal.extend({
			initialize: function(options) {
				this.on( 'all', function( name, event ) {
					//console.log( 'Animal2: %o', arguments );
					if ( name.indexOf( 'change' ) === 0 ) {
						modelChangeEvents++;
					}
				});
			}
		});

		var AnimalCollection2 = AnimalCollection.extend({
			model: Animal2,

			initialize: function(options) {
				this.on( 'all', function( name, event ) {
					//console.log( 'AnimalCollection2: %o', arguments );
					if ( name.indexOf('change') === 0 ) {
						collectionChangeEvents++;
					}
				});
			}
		});

		var zoo = new Zoo( { id: 'zoo-1' } );

		var coll = new AnimalCollection2();
		coll.set( [{
			id: 'animal-1',
			livesIn: 'zoo-1'
		}] );

		equal( collectionChangeEvents, 0, 'no change event should be triggered on the collection' );

		modelChangeEvents = collectionChangeEvents = 0;

		coll.at( 0 ).set( 'name', 'Willie' );

		equal( modelChangeEvents, 2, 'change event should be triggered' );
	});

	QUnit.test( "Model's collection children should be in the proper order during fetch w/remove: false", function() {
		var Child = Backbone.Relational.Model.extend();
		var Parent = Backbone.Relational.Model.extend( {
			relations: [ {
				type: Backbone.Relational.HasMany,
				key: 'children',
				relatedModel: Child
			} ]
		} );

		// initialize a child... there's no good reason why this should affect the test passing
		Child.findOrCreate( { id: 'foo1' } );

		// simulate a fetch of the parent with nested children
		var parent = Parent.findOrCreate( { id: 'the-parent' } );
		var children = parent.get( 'children' );
		equal( children.length, 0 );
		parent.set({
			id: 'the-parent',
			children: [
				{ id: 'foo1' },
				{ id: 'foo2' }
			]
		}, {
			remove: false // maybe necessary in case you have other relations with isNew models, etc.
		});

		// check order of parent's children
		equal( children.length, 2, 'parent is fetched with children' );
		deepEqual( children.pluck('id'), ['foo1', 'foo2'], 'children are in the right order' );
	});

QUnit.module( "Backbone.Relational.Model inheritance (`subModelTypes`)", { setup: require('./setup/setup').reset } );

	QUnit.test( "Object building based on type, when using explicit collections" , function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );

		scope.Mammal = Animal.extend({
			subModelTypes: {
				'primate': 'Primate',
				'carnivore': 'Carnivore',
				'ape': 'Primate' // To check multiple keys for the same submodel; see GH-429
			}
		});
		scope.Primate = scope.Mammal.extend({
			subModelTypes: {
				'human': 'Human'
			}
		});
		scope.Human = scope.Primate.extend();
		scope.Carnivore = scope.Mammal.extend();

		var MammalCollection = AnimalCollection.extend({
			model: scope.Mammal
		});

		var mammals = new MammalCollection( [
			{ id: 5, species: 'chimp', type: 'primate' },
			{ id: 6, species: 'panther', type: 'carnivore' },
			{ id: 7, species: 'person', type: 'human' },
			{ id: 8, species: 'gorilla', type: 'ape' }
		]);

		ok( mammals.at( 0 ) instanceof scope.Primate );
		ok( mammals.at( 1 ) instanceof scope.Carnivore );
		ok( mammals.at( 2 ) instanceof scope.Human );
		ok( mammals.at( 3 ) instanceof scope.Primate );
	});

	QUnit.test( "Object building based on type, when used in relations" , function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );

		var PetAnimal = scope.PetAnimal = Backbone.Relational.Model.extend({
			subModelTypes: {
				'cat': 'Cat',
				'dog': 'Dog'
			}
		});
		var Dog = scope.Dog = PetAnimal.extend({
			subModelTypes: {
				'poodle': 'Poodle'
			}
		});
		var Cat = scope.Cat = PetAnimal.extend();
		var Poodle = scope.Poodle = Dog.extend();

		var PetPerson = scope.PetPerson = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key: 'pets',
				relatedModel: PetAnimal,
				reverseRelation: {
					key: 'owner'
				}
			}]
		});

		var petPerson = new scope.PetPerson({
			pets: [
				{
					type: 'dog',
					name: 'Spot'
				},
				{
					type: 'cat',
					name: 'Whiskers'
				},
				{
					type: 'poodle',
					name: 'Mitsy'
				}
			]
		});

		ok( petPerson.get( 'pets' ).at( 0 ) instanceof Dog );
		ok( petPerson.get( 'pets' ).at( 1 ) instanceof Cat );
		ok( petPerson.get( 'pets' ).at( 2 ) instanceof Poodle );

		petPerson.get( 'pets' ).add([{
			type: 'dog',
			name: 'Spot II'
		},{
			type: 'poodle',
			name: 'Mitsy II'
		}]);

		ok( petPerson.get( 'pets' ).at( 3 ) instanceof Dog );
		ok( petPerson.get( 'pets' ).at( 4 ) instanceof Poodle );
	});

	QUnit.test( "Object building based on type in a custom field, when used in relations" , function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );

		var Caveman = scope.Caveman = Backbone.Relational.Model.extend({
			subModelTypes: {
				'rubble': 'Rubble',
				'flintstone': 'Flintstone'
			},
			subModelTypeAttribute: "caveman_type"
		});
		var Flintstone = scope.Flintstone = Caveman.extend();
		var Rubble = scope.Rubble = Caveman.extend();

		var Cartoon = scope.Cartoon = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key: 'cavemen',
				relatedModel: Caveman
			}]
		});

		var captainCaveman = new scope.Cartoon({
			cavemen: [
				{
					type: 'rubble',
					name: 'CaptainCaveman'
				}
			]
		});

		ok( !(captainCaveman.get( "cavemen" ).at( 0 ) instanceof Rubble) );

		var theFlintstones = new scope.Cartoon({
			cavemen: [
				{
					caveman_type: 'rubble',
					name: 'Barney'

				},
				{
					caveman_type: 'flintstone',
					name: 'Wilma'
				}
			]
		});

		ok( theFlintstones.get( "cavemen" ).at( 0 ) instanceof Rubble );
		ok( theFlintstones.get( "cavemen" ).at( 1 ) instanceof Flintstone );

	});

	QUnit.test( "Automatic sharing of 'superModel' relations" , function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );

		scope.PetPerson = Backbone.Relational.Model.extend({});
		scope.PetAnimal = Backbone.Relational.Model.extend({
			subModelTypes: {
				'dog': 'Dog'
			},

			relations: [{
				type: Backbone.Relational.HasOne,
				key:  'owner',
				relatedModel: scope.PetPerson,
				reverseRelation: {
					type: Backbone.Relational.HasMany,
					key: 'pets'
				}
			}]
		});

		scope.Flea = Backbone.Relational.Model.extend({});

		scope.Dog = scope.PetAnimal.extend({
			subModelTypes: {
				'poodle': 'Poodle'
			},

			relations: [{
				type: Backbone.Relational.HasMany,
				key:	'fleas',
				relatedModel: scope.Flea,
				reverseRelation: {
					key: 'host'
				}
			}]
		});
		scope.Poodle = scope.Dog.extend();

		var dog = new scope.Dog({
			name: 'Spot'
		});

		var poodle = new scope.Poodle({
			name: 'Mitsy'
		});

		var person = new scope.PetPerson({
			pets: [ dog, poodle ]
		});

		ok( dog.get( 'owner' ) === person, "Dog has a working owner relation." );
		ok( poodle.get( 'owner' ) === person, "Poodle has a working owner relation." );

		var flea = new scope.Flea({
			host: dog
		});

		var flea2 = new scope.Flea({
			host: poodle
		});

		ok( dog.get( 'fleas' ).at( 0 ) === flea, "Dog has a working fleas relation." );
		ok( poodle.get( 'fleas' ).at( 0 ) === flea2, "Poodle has a working fleas relation." );
	});

	QUnit.test( "Initialization and sharing of 'superModel' reverse relations from a 'leaf' child model" , function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );
		scope.PetAnimal = Backbone.Relational.Model.extend({
			subModelTypes: {
				'dog': 'Dog'
			}
		});

		scope.Flea = Backbone.Relational.Model.extend({});
		scope.Dog = scope.PetAnimal.extend({
			subModelTypes: {
				'poodle': 'Poodle'
			},
			relations: [{
				type: Backbone.Relational.HasMany,
				key:	'fleas',
				relatedModel: scope.Flea,
				reverseRelation: {
					key: 'host'
				}
			}]
		});
		scope.Poodle = scope.Dog.extend();

		// Define the PetPerson after defining all of the Animal models. Include the 'owner' as a reverse-relation.
		scope.PetPerson = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key:  'pets',
				relatedModel: scope.PetAnimal,
				reverseRelation: {
					type: Backbone.Relational.HasOne,
					key: 'owner'
				}
			}]
		});

		// Initialize the models starting from the deepest descendant and working your way up to the root parent class.
		var poodle = new scope.Poodle({
			name: 'Mitsy'
		});

		var dog = new scope.Dog({
			name: 'Spot'
		});

		var person = new scope.PetPerson({
			pets: [ dog, poodle ]
		});

		ok( dog.get( 'owner' ) === person, "Dog has a working owner relation." );
		ok( poodle.get( 'owner' ) === person, "Poodle has a working owner relation." );

		var flea = new scope.Flea({
			host: dog
		});

		var flea2 = new scope.Flea({
			host: poodle
		});

		ok( dog.get( 'fleas' ).at( 0 ) === flea, "Dog has a working fleas relation." );
		ok( poodle.get( 'fleas' ).at( 0 ) === flea2, "Poodle has a working fleas relation." );
	});

	QUnit.test( "Initialization and sharing of 'superModel' reverse relations by adding to a polymorphic HasMany" , function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );
		scope.PetAnimal = Backbone.Relational.Model.extend({
			// The order in which these are defined matters for this regression test.
			subModelTypes: {
				'dog': 'Dog',
				'fish': 'Fish'
			}
		});

		// This looks unnecessary but it's for this regression test there has to be multiple subModelTypes.
		scope.Fish = scope.PetAnimal.extend({});

		scope.Flea = Backbone.Relational.Model.extend({});
		scope.Dog = scope.PetAnimal.extend({
			subModelTypes: {
				'poodle': 'Poodle'
			},
			relations: [{
				type: Backbone.Relational.HasMany,
				key:	'fleas',
				relatedModel: scope.Flea,
				reverseRelation: {
					key: 'host'
				}
			}]
		});
		scope.Poodle = scope.Dog.extend({});

		// Define the PetPerson after defining all of the Animal models. Include the 'owner' as a reverse-relation.
		scope.PetPerson = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key:  'pets',
				relatedModel: scope.PetAnimal,
				reverseRelation: {
					type: Backbone.Relational.HasOne,
					key: 'owner'
				}
			}]
		});

		// We need to initialize a model through the root-parent-model's build method by adding raw-attributes for a
		// leaf-child-class to a polymorphic HasMany.
		var person = new scope.PetPerson({
			pets: [{
				type: 'poodle',
				name: 'Mitsy'
			}]
		});
		var poodle = person.get('pets').first();
		ok( poodle.get( 'owner' ) === person, "Poodle has a working owner relation." );
	});

	QUnit.test( "Overriding of supermodel relations", function() {
		var models = {};
		Backbone.Relational.store.addModelScope( models );

		models.URL = Backbone.Relational.Model.extend({});

		models.File = Backbone.Relational.Model.extend({
			subModelTypes: {
				'video': 'Video',
				'publication': 'Publication'
			},

			relations: [{
				type: Backbone.Relational.HasOne,
				key: 'url',
				relatedModel: models.URL
			}]
		});

		models.Video = models.File.extend({});

		// Publication redefines the `url` relation
		models.Publication = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key: 'url',
				relatedModel: models.URL
			}]
		});

		models.Project = Backbone.Relational.Model.extend({
			relations: [{
				type: Backbone.Relational.HasMany,
				key: 'files',
				relatedModel: models.File,
				reverseRelation: {
					key: 'project'
				}
			}]
		});

		equal( models.File.prototype.relations.length, 2, "2 relations on File" );
		equal( models.Video.prototype.relations.length, 1, "1 relation on Video" );
		equal( models.Publication.prototype.relations.length, 1, "1 relation on Publication" );

		// Instantiating the superModel should instantiate the modelHierarchy, and copy relations over to subModels
		var file = new models.File();

		equal( models.File.prototype.relations.length, 2, "2 relations on File" );
		equal( models.Video.prototype.relations.length, 2, "2 relations on Video" );
		equal( models.Publication.prototype.relations.length, 2, "2 relations on Publication" );

		var projectDecription = {
			name: 'project1',

			files: [
				{
					name: 'file1 - video subclass',
					type: 'video',
					url: {
						location: 'http://www.myurl.com/file1.avi'
					}
				},
				{
					name: 'file2 - file baseclass',
					url: {
						location: 'http://www.myurl.com/file2.jpg'
					}
				},
				{
					name: 'file3 - publication',
					type: 'publication',
					url: [
						{ location: 'http://www.myurl.com/file3.pdf' },
						{ location: 'http://www.anotherurl.com/file3.doc' }
					]
				}
			]
		};

		var project = new models.Project( projectDecription ),
			files = project.get( 'files' ),
			file1 = files.at( 0 ),
			file2 = files.at( 1 ),
			file3 = files.at( 2 );

		equal( models.File.prototype.relations.length, 2, "2 relations on File" );
		equal( models.Video.prototype.relations.length, 2, "2 relations on Video" );
		equal( models.Publication.prototype.relations.length, 2, "2 relations on Publication" );

		equal( _.size( file1._relations ), 2 );
		equal( _.size( file2._relations ), 2 );
		equal( _.size( file3._relations ), 2 );

		ok( file1.get( 'url' ) instanceof Backbone.Model, '`url` on Video is a model' );
		ok( file1.getRelation( 'url' ) instanceof Backbone.Relational.HasOne, '`url` relation on Video is HasOne' );

		ok( file3.get( 'url' ) instanceof Backbone.Relational.Collection, '`url` on Publication is a collection' );
		ok( file3.getRelation( 'url' ) instanceof Backbone.Relational.HasMany, '`url` relation on Publication is HasMany' );
	});

	QUnit.test( "toJSON includes the type", function() {
		var scope = {};
		Backbone.Relational.store.addModelScope( scope );

		scope.PetAnimal = Backbone.Relational.Model.extend({
			subModelTypes: {
				'dog': 'Dog'
			}
		});

		scope.Dog = scope.PetAnimal.extend();

		var dog = new scope.Dog({
			name: 'Spot'
		});

		var json = dog.toJSON();

		equal( json.type, 'dog', "The value of 'type' is the pet animal's type." );
	});
