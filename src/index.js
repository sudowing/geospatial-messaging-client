import * as turf from '@turf/turf'
import { customAlphabet } from 'nanoid';
import ngeohash from 'ngeohash';
import { createClient } from 'redis';
import { BehaviorSubject } from 'rxjs';
import {difference} from "set-operations";
import wkx from 'wkx';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const gen_id = customAlphabet(alphabet, 22);

export const buildClientEvent = event => ({eventType: "clientConfig", event});

const initGeo = ({cid, polygon_coordinates, geohash_length, party_key}) => {
    try{
        const geo_polygon = turf.polygon(polygon_coordinates);
        const geo_envelope = turf.envelope(geo_polygon);
        const [minlon, minlat, maxlo, maxlat] = geo_envelope.bbox;
        const geohash_precision = geohash_length && Number.isInteger(geohash_length)
            ? geohash_length : 6;
        const geohashes = ngeohash.bboxes(minlat, minlon, maxlat, maxlo, geohash_precision);
        const n_geohashes = geohashes.length;
        const wkx_geo = wkx.Geometry.parseGeoJSON(geo_polygon.geometry);
        const geo_wkb_hex = wkx_geo.toWkb().toString('hex');

        const client_data = {
            cid
           ,geo_polygon
           ,geo_envelope
           ,geohashes: party_key ? geohashes.map(gh => `${party_key}:${gh}`) : geohashes
           ,geohash_precision
           ,n_geohashes
           ,wkx_geo
           ,geo_wkb_hex
       };
       return client_data;
    }
    catch(err){
        return {
            message: 'failed to initialize client'
            ,error_detail: err
        }
    }
}


export default class GeoSpatialClient {

    /**
     *
     * @param {string} polygon_coordinates - geo coords to be used by [Turf.js](https://turfjs.org/docs/#polygon) to create a poly;
     * @param {integer} geohash_length - Length or GeoHashes to calculate. Polygons rest atop a grid -- this param is the resolution of the grid.
     * @param {string} [party_key] - Optional. Method for isolating channels for use by clients
     * When you `.send()` a message -- it is published to cells of the grid. Client Mem and Redis capacity and Time are all impacted by this value.
     * @return {GeospatialClient}
     *
     */
    constructor({polygon_coordinates, geohash_length, party_key}) {
        // assign client_id
        const cid = gen_id();
        this.client_data = initGeo({cid, polygon_coordinates, geohash_length, party_key})
        this.client = null;
        this.geo_clients = {};
        this.mcache = {};

        // the default value gets ignored because I set the first message in the .connect method
        this.observable = new BehaviorSubject(buildClientEvent({name: 'init', state: 'complete'}));
        
    }


    /**
     * Establish N number of Redis Connections - 1 for pub & many for pSub (pattern: `geohash*`)
     * @param {object} redis_client_config - the `clientConfiguratoin` obj needed for the [node-redis client](https://github.com/redis/node-redis/blob/master/docs/client-configuration.md)
     *
     * @return {Promise<boolean>}
     *
     */
    async connect({redis_client_config}){
        try{
            const redisConfig = redis_client_config || {};
            this.client = await createClient(redisConfig).connect();

            // create individual clients to support pSub for each geohash
            for(const geohash of this.client_data.geohashes){

                this.geo_clients[geohash] = await this.client.duplicate().connect();
                await this.geo_clients[geohash].pSubscribe(`${geohash}*`, this._pListener())
        
            }

            this.observable.next(buildClientEvent({name: 'connect', state: 'complete'}))

            const fn = () => this._heartbeat.apply(this)

            setInterval(async () => { await fn() }, 2250)



            Promise.resolve(true);

        }
        catch(err){

            Promise.reject(err)
        }

    }
    

    /**
     *
     * @param {object} event - Payload
     * @param {string} [eventType] - Optional. Intended for usage via your `subscriber` handler.
     *
     * @return {Promise<integer[]>}
     *
     */
    send(event, eventType=null){
        const cid = this.client_data.cid;
        const mid = gen_id();
        const geo_target = this.client_data.geo_wkb_hex;
        const message = {cid, mid, geo_target, event, eventType}

        // send to redis channels
        const pub_calls = this.client_data.geohashes.map(geohash => this.client.publish(geohash, JSON.stringify(message)));
        return Promise.all(pub_calls);
    }    



    /**
     *
     * @param {string} polygon_coordinates - geo coords to be used by [Turf.js](https://turfjs.org/docs/#polygon) to create a poly;
     * @param {integer} geohash_length - Length or GeoHashes to calculate. Polygons rest atop a grid -- this param is the resolution of the grid.
     * @param {string} [party_key] - Optional. Method for isolating channels for use by clients
     * When you `.send()` a message -- it is published to cells of the grid. Client Mem and Redis capacity and Time are all impacted by this value.
     * @return {Promise<boolean>}
     *
     */
    async update({polygon_coordinates, geohash_length, party_key}) {

        try {

            const cid = this.client_data.cid;

            const new_client_data = initGeo({cid, polygon_coordinates, geohash_length, party_key})
            
            const toRemove = difference(this.client_data.geohashes, new_client_data.geohashes);
            for (const geohash of toRemove) {
                await this.geo_clients[geohash].disconnect();
                delete this.geo_clients[geohash];
            }
            
            const toAdd = difference(new_client_data.geohashes, this.client_data.geohashes);
            for (const geohash of toAdd) {
                this.geo_clients[geohash] = await this.client.duplicate().connect();
                await this.geo_clients[geohash].pSubscribe(`${geohash}*`, this._pListener())
            }

            this.client_data = new_client_data

            Promise.resolve(true);

        }
        catch(err){

            Promise.reject(err)
        }        

    }
    
    /**
     * Explicitly closes all open Redis - 1 for pub & many for pSub (pattern: `geohash*`)
     *
     * @return {Promise<boolean>}
     *
     */
    async disconnect(){
        try{

            // disconnect individual clients to support pSub for each geohash
            for(const geohash of this.client_data.geohashes){
                await this.geo_clients[geohash].disconnect();
            }

            // unregister the client
            await this.client.del(this.client_data.cid);

            // disconnect from redis
            await this.client.disconnect();

            this.observable.next(buildClientEvent({name: 'disconnect', state: 'complete'}))

            Promise.resolve(true);

        }
        catch(err){
            Promise.reject(err)
        }
    }

    /**
     * broadcast a signal across your polygon -- so all other clients know you are connected
     *
     * @return {Promise<integer[]>}
     *
     */
    _heartbeat(){
        const cid = this.client_data.cid;
        const mid = gen_id();
        const geo_target = this.client_data.geo_wkb_hex;
        const geohash_precision = this.client_data.geohash_precision;
        const message = {cid, mid, geo_target, event: {geohash_precision}, eventType: '_heartbeat'}

        // send to redis channels
        const pub_calls = this.client_data.geohashes.map(geohash => this.client.publish(geohash, JSON.stringify(message)));
        return Promise.all(pub_calls);
    }

    // pSub handler (has diff signature than sub)
    _pListener(){
        // curry fn to depInject OOM context
        return (json_message, channel) => {
            const {cid, mid, geo_target, event, eventType} = JSON.parse(json_message)

            const baseNewMessage = {cid, mid, event}
            const newMessage = eventType ? {eventType, ...baseNewMessage} : baseNewMessage;

            // check against cache and care --
            if(!this.mcache[mid]){
                // assumes downsream calls succed -- really just need atemp lock until we are done
                this.mcache[mid] = 1;

                const areaInterest = this.client_data.geo_polygon;
                const areaTarget = wkx.Geometry.parse(Buffer.from(geo_target, "hex")).toGeoJSON();
                const intersectsTargetAndInterest = turf.intersect(areaInterest, areaTarget);

                if(intersectsTargetAndInterest){
                    this.observable.next(newMessage);
                }
            }

    
        }
    }

}
