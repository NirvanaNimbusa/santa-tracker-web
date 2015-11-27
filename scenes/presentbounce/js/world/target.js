/*
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
'use strict'

goog.provide('app.world.Target');

goog.require('b2');
goog.require('app.Unit');
goog.require('app.world.LevelObject');


goog.scope(function () {
  const Unit = app.Unit;


  /**
   * Target class
   * A U-shaped target with angled edges to help guide in ball
   */
  class Target extends app.world.LevelObject {

    /**
     * @override
     */
    constructor(...args) {
      super(...args); // super(...arguments) doesn't work in Closure Compiler
      this.body_ = this.buildBody_();
      this.onCollision_ = this.onCollision_.bind(this);
      this.registerForCollisions( this.onCollision_ );
    }

    onCollision_(contact) {
      if (!this.collisionFixture) return;

      const hasHitCollisionFixture = (contact.GetFixtureA().ID === this.collisionFixture.ID || contact.GetFixtureB().ID === this.collisionFixture.ID);
      const hasCallback = (this.level_ && typeof this.level_.onCompleteCallback === 'function');

      if ( hasHitCollisionFixture && hasCallback) {
        this.unregisterForCollisions();
        this.level_.onCompleteCallback();
      }
    }

    setCollisionFixture(obj) {
      this.collisionFixture = obj;
    }

    /**
     * @inheritDoc
     */
    buildBody_() {
      const bodyDef = new b2.BodyDef();
      bodyDef.type = b2.BodyDef.b2_staticBody;
      bodyDef.position.Set(this.initialWorldPos_.x, this.initialWorldPos_.y - Unit.toWorld(30));

      // create the target fixture definition
      const width = this.config_.style.objectWidth;
      const height = this.config_.style.objectHeight;
      const material = this.config_.material;

      const worldWidth = Unit.toWorld(width);
      const worldHeight = Unit.toWorld(height);

      const leftEdgeFixDef = new b2.FixtureDef();
      leftEdgeFixDef.density = material.globeDensity;
      leftEdgeFixDef.friction = material.friction;
      leftEdgeFixDef.restitution = material.restitution;
      leftEdgeFixDef.shape = b2.PolygonShape.AsEdge(new b2.Vec2(-worldWidth/2.2, -worldHeight/2), new b2.Vec2(-worldWidth*0.4, -worldHeight*0.4));

      const leftFixDef = new b2.FixtureDef();
      leftFixDef.density = material.globeDensity;
      leftFixDef.friction = material.friction;
      leftFixDef.restitution = material.restitution;
      leftFixDef.shape = b2.PolygonShape.AsEdge(new b2.Vec2(-worldWidth*0.4, -worldHeight*0.4), new b2.Vec2(-worldWidth*0.4, worldHeight/2));

      const bottomFixDef = new b2.FixtureDef();
      bottomFixDef.density = material.globeDensity;
      bottomFixDef.friction = material.friction;
      bottomFixDef.restitution = material.restitution;
      bottomFixDef.shape = b2.PolygonShape.AsEdge(new b2.Vec2(-worldWidth*0.4, worldHeight/2), new b2.Vec2(worldWidth*0.4, worldHeight/2));

      const innerBottomFixDef = new b2.FixtureDef();
      innerBottomFixDef.density = material.globeDensity;
      innerBottomFixDef.friction = material.friction;
      innerBottomFixDef.restitution = material.restitution;
      innerBottomFixDef.shape = b2.PolygonShape.AsEdge(new b2.Vec2(-worldWidth*0.4, worldHeight/2.5), new b2.Vec2(worldWidth*0.4, worldHeight/2.5));

      const rightFixDef = new b2.FixtureDef();
      rightFixDef.density = material.globeDensity;
      rightFixDef.friction = material.friction;
      rightFixDef.restitution = material.restitution;
      rightFixDef.shape = b2.PolygonShape.AsEdge(new b2.Vec2(worldWidth*0.4, worldHeight/2), new b2.Vec2(worldWidth*0.4, -worldHeight*0.4));

      const rightEdgeFixDef = new b2.FixtureDef();
      rightEdgeFixDef.density = material.globeDensity;
      rightEdgeFixDef.friction = material.friction;
      rightEdgeFixDef.restitution = material.restitution;
      rightEdgeFixDef.shape = b2.PolygonShape.AsEdge(new b2.Vec2(worldWidth*0.4, -worldHeight*0.4), new b2.Vec2(worldWidth/2.2, -worldHeight/2));

      const body = this.world_.CreateBody( bodyDef );
      body.CreateFixture( leftEdgeFixDef );
      body.CreateFixture( leftFixDef );
      body.CreateFixture( rightFixDef );
      body.CreateFixture( rightEdgeFixDef );
      body.CreateFixture( bottomFixDef );
      this.setCollisionFixture( body.CreateFixture( innerBottomFixDef ) );
      return body;
    }
  }


  app.world.Target = Target;

});
