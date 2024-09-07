### Geospatial Messaging Client

![geospatial-messaging-client promo-art](assets/geohash-layers.png "Geospatial Messaging Client | Promo Poster (Geohash Scales and Custom Polygons)")

The purpose of this client is to facilitate communication via geospatial area -- meaning the client will have the ability to define custom polygons for broadcasting via Pub/Sub.

The core mechanism enabling this solution involves normalizing all custom polygons to a base grid -- made up of geohashes. Each geohash maps to a redis channel, where messages get published, enabling other clients to subscribe via `redis.psubscribe`.

A client subscribes to all tiles/channels that intersect with the defined custom polygon -- and publishes any message to this same set of tiles/channels.

As currently implemented, a client can subscribe to geohash tiles at/beneath them, while publishing at/above them.

# Client Overview: Basic Usage
```js
import GeoSpatialClient from 'geospatial-messaging-client';
import * as samples from './data_samples.js';

const eventHandler = ({eventType, ...event}) => console.log(eventType || 'default', `${JSON.stringify(event)}`);

const client = new GeoSpatialClient({polygon_coordinates: samples.coords_002, geohash_length: 5});

// subscribe to the event stream (RxJS)
client.observable.subscribe(eventHandler);

await client.connect({});

await client.send({hello: 'world'});
await client.send({goodbye: 'night'});

const film = {
   name: 'harry potter'
  ,year: 2001
  ,run_time: '152 minutes'
  ,bidget: '$125M'
  ,box_office: '$1.024B'      
}
await client.send(film, 'movieShowing');
```

## CHANGE 01 // location

```js
await client.update({polygon_coordinates: samples.circle_coordinates, geohash_length: 5});

await client.send({strawberry: 'fields'});
await client.send({sargent: 'peppers'});

const bar = {
    venue: 'The Bull and Finch Pub'
   ,date: '2024-01-04'
   ,address: {
      street: '84 Beacon St'
     ,city: 'Boston'
     ,state: 'MA'
     ,zipcode: '02108'
   }
}

await client.send(bar, 'happyHour');
```


## CHANGE 02 // location, geohash_length & party_key

```js
await client.update({polygon_coordinates: samples.star_coordinates, geohash_length: 5, party_key: 'grp42'});

await client.send({atlanta: 'braves'});
await client.send({philadlephia: 'eagles'});

const concert = {
    artist: 'The Foo Fighters'
   ,date: '2024-6-23'
   ,address: {
     street: 'Hershey Park Stadium'
     ,city: 'Hershey'
     ,state: 'PA'
     ,zipcode: '02108'
   }
}

await client.send(concert, 'liveMusic');
```

## disconnect
```js
await client.disconnect();
```


# Development Notes

## run redis locally
```sh

# create docker network (if db on docker network)
docker network create mynetwork

docker run -d \
	--network mynetwork \
	-p 6379:6379 \
	--name some-redis \
	redis
```

## package publishing

```sh
npm login

npm run release
```

## Future Features
- mcache handling (short TTLs)
- direct messaging (client_id <-> client_id)
- party messaging
