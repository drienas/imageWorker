const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const mongo = process.env.MONGO_DB || 'jobrouter6:27017';
const mongoUrl = `mongodb://${mongo}/cardata`;

const imageSchema = new mongoose.Schema({
  image: {
    type: Buffer,
  },
  tags: [String],
  positionIdentifier: Number,
});

const carSchema = new mongoose.Schema({
  vin: { type: String, index: true },
  images: [
    {
      positionIdentifier: Number,
      imageId: mongoose.Types.ObjectId,
    },
  ],
});

const getDataObject = (file) => {
  let obj = { tags: [] };
  obj.binary = fs.readFileSync(path.resolve(__dirname, 'incoming', file));
  obj.vin = file.match(/\w{17}/gi)[0];
  obj.positionIdentifier = parseInt(
    file.replace(/\w{17}\_/gi, '').replace(/\.(jpg|png)/gi, '')
  );
  return obj;
};

let isBusy = false;
let last = null;

const runSync = async () => {
  console.log(`Running picture cycle...`);
  if (isBusy) {
    console.log(`Picture Cycle is busy...`);
    return;
  }
  isBusy = true;
  try {
    last = Date.now();
    let files = fs.readdirSync(path.normalize('incoming'));
    if (files.length < 1) return;
    const db = await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });
    console.log(`Processing ${files.length} files`);
    for (let file of files) {
      try {
        if (!/^\w{17}\_\d+\.(jpg|png)$/gi.test(file)) {
        }
        let fileObject = getDataObject(file);

        const Image = mongoose.model('Image', imageSchema);
        const Car = mongoose.model('Car', carSchema);

        const dupeCheckImage = await Image.find({ image: fileObject.binary });
        let existingCar = await Car.find({ vin: fileObject.vin });

        // If the picture does not existing in the Database

        let imageId;

        if (dupeCheckImage.length === 0) {
          const query = await new Image({
            image: fileObject.binary,
            tags: fileObject.tags,
            positionIdentifier: fileObject.positionIdentifier,
          }).save();
          imageId = query._id;
        } else imageId = dupeCheckImage[0]._id;

        // If the car does not existing in the Database
        if (existingCar.length === 0) {
          const query = await new Car({
            vin: fileObject.vin,
            images: [
              { positionIdentifier: fileObject.positionIdentifier, imageId },
            ],
          }).save();
        } else {
          existingCar = existingCar[0];
          let hasExistingHit = existingCar.images.findIndex(
            (x) => x.positionIdentifier === fileObject.positionIdentifier
          );
          if (hasExistingHit !== -1) {
            existingCar.images[hasExistingHit].imageId = imageId;
            let updateQuery = await Car.updateOne(
              { _id: existingCar._id },
              existingCar
            );
          } else {
            const update = {
              $push: {
                images: [
                  {
                    imageId,
                    positionIdentifier: fileObject.positionIdentifier,
                  },
                ],
              },
            };
            let updateQuery = await Car.updateOne(
              { _id: existingCar._id },
              update
            );
          }
        }
      } catch (err) {
        console.error(err);
        continue;
      }
      fs.copyFileSync(
        path.resolve(__dirname, 'incoming', file),
        path.resolve(__dirname, 'dump', file)
      );
      fs.unlinkSync(path.resolve(__dirname, 'incoming', file));
    }
  } catch (err) {
    console.log(err);
    console.log(`Picture cycle encountered an error...`);
  } finally {
    console.log(`Picture cycle complete...`);
    isBusy = false;
  }
};

(async () => {
  await runSync();
  setInterval(async () => {
    await runSync();
  }, 120000);
})();

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({
    healthy: Date.now() - last < 10 * 60 * 1000,
  });
});

app.listen(3333);
