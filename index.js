const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const port = process.env.PORT || 9000
const app = express()
const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

// this uri is shakil vai
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@main.yolij.mongodb.net/?retryWrites=true&w=majority&appName=Main`

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jo0u1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

// middleWere
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) { return res.status(401).send({ message: 'un authorized access' }) };
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) { return res.status(401).send({ message: 'un authorized access' }) };
    req.user = decoded;
  })
  // console.log(token);
  next()
}

async function run() {
  try {
    // generate jwt

    app.post('/jwt', async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, { expiresIn: '10h' })
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({success:true})
    })
    // remove token from browser
    app.get('/logOut', async (req, res) => {
      res.
        clearCookie('token', {
          maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({success:true})
    })
    
    // const db = client.db('solo-db')
    // const jobsCollection = db.collection('jobs')
    const jobsCollection = client.db('solo-db').collection('jobs')
    const bidsCollection=client.db('solo-db').collection('bids')


    // save a jobData in db
    app.post('/add-job', async (req, res) => {
      const jobData = req.body
      const result = await jobsCollection.insertOne(jobData)
      console.log(result)
      res.send(result)
    })

    // get all jobs data from db
    app.get('/jobs', async (req, res) => {
      const result = await jobsCollection.find().toArray()
      res.send(result)
    })

    // get all jobs posted by a specific user
    app.get('/jobs/:email', verifyToken, async (req, res) => {
      const decodedEmail = req.user?.email;
      const email = req.params.email
    if(decodedEmail!==email){ return res.status(401).send({ message: 'un authorized access' }) };
      const query = { 'buyer.email': email }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    // delete a job from db
    app.delete('/job/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
    })

    // get a single job data by id from db
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    // save a jobData in db
    app.put('/update-job/:id', async (req, res) => {
      const id = req.params.id
      const jobData = req.body
      const updated = {
        $set: jobData,
      }
      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const result = await jobsCollection.updateOne(query, updated, options)
      console.log(result)
      res.send(result)
    })

    // get all bidsData for a specific user
    app.get('/bids-data/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = {
        buyer:email,
      };
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    })



    // get all data 
    app.get('/all-jobs', async (req, res) => {
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;
      let options={}
      if (sort) options = { sort: { deadline: sort === 'asc' ? 1 : -1 } };
      let query = {
        title: {
          $regex:search ,
          $options: 'i'
      }};
      if (filter) query.category = filter;
      const result = await jobsCollection.find(query,options).toArray();
      res.send(result)
    })



    // update bid status
    app.patch('/update-bid-status/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const {status} = req.body;
      const update = {
        $set:{
          status
        }
      }
      const result = await bidsCollection.updateOne(filter, update);
      res.send(result)
    })
    // get data from bidCollection a specific user
    app.get('/bids/:email', async (req, res) => {
      const isBuyer = req.query.buyer;
      const email = req.params.email;

     
      let query = {};
      if (isBuyer) {
        query.buyer=email
      } else {
        query.email=email
      }
    
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    })

    // save bid data in db
    app.post('/add-bid', async (req, res) => {
      const bidData = req.body;
      // 0. if a user place a bid he can't not again bid
      const query = { email: bidData?.email, jobId: bidData?.jobId };
      const alReadyExist = await bidsCollection.findOne(query);
      console.log('already existData', alReadyExist);
      if (alReadyExist) return res.status(400).send('you all ready bid this job')
      
      // 1. save data in bid collection
      const result = await bidsCollection.insertOne(bidData);
      // 2. update bid count
      const filter = { _id: new ObjectId(bidData.jobId) };
      const update = {
        $inc: {
          bid_count: 1,
        }
      }
      const updateBidCount=await jobsCollection.updateOne(filter,update)
      res.send(result)
    })
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
