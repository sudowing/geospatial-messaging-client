### geospatial-messaging-client

# Client Overview

## Basic Usage
```js
import GeoSpatialClient from './client.js';

const eventHandler = event => console.log(`${JSON.stringify(event)}`);

const client = new GeoSpatialClient({polygon_coordinates: samples.coords_002, geohash_length: 5});

// subscribe to the event stream
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



# run redis locally
```sh

# create docker network (if db on docker network)
docker network create mynetwork

docker run -d \
	--network mynetwork \
	-p 6379:6379 \
	--name some-redis \
	redis
```

# Future Features
- mcache handling (short TTLs)

